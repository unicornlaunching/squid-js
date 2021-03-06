import AquariusProvider from "../aquarius/AquariusProvider"
import SearchQuery from "../aquarius/query/SearchQuery"
import BrizoProvider from "../brizo/BrizoProvider"
import ConfigProvider from "../ConfigProvider"
import Authentication from "../ddo/Authentication"
import Condition from "../ddo/Condition"
import Contract from "../ddo/Contract"
import DDO from "../ddo/DDO"
import Event from "../ddo/Event"
import EventHandler from "../ddo/EventHandler"
import MetaData from "../ddo/MetaData"
import PublicKey from "../ddo/PublicKey"
import Service from "../ddo/Service"
import ContractEvent from "../keeper/Event"
import Keeper from "../keeper/Keeper"
import Web3Provider from "../keeper/Web3Provider"
import Config from "../models/Config"
import ValueType from "../models/ValueType"
import SecretStoreProvider from "../secretstore/SecretStoreProvider"
import Logger from "../utils/Logger"
import Account from "./Account"
import DID from "./DID"
import IdGenerator from "./IdGenerator"
import ServiceAgreement from "./ServiceAgreements/ServiceAgreement"
import ServiceAgreementTemplate from "./ServiceAgreements/ServiceAgreementTemplate"
import Access from "./ServiceAgreements/Templates/Access"

import EventListener from "../keeper/EventListener"

export default class Ocean {

    public static async getInstance(config: Config) {

        if (!Ocean.instance) {
            ConfigProvider.setConfig(config)
            Ocean.instance = new Ocean()
            Ocean.instance.keeper = await Keeper.getInstance()
        }

        return Ocean.instance
    }

    private static instance = null

    private keeper: Keeper

    private constructor() {
    }

    public async getAccounts(): Promise<Account[]> {

        // retrieve eth accounts
        const ethAccounts = await Web3Provider.getWeb3().eth.getAccounts()

        return ethAccounts.map((address: string) => new Account(address))
    }

    public async resolveDID(did: string): Promise<DDO> {

        const d: DID = DID.parse(did)
        return AquariusProvider.getAquarius().retrieveDDO(d)
    }

    public async registerAsset(metadata: MetaData, publisher: Account): Promise<DDO> {

        const {didRegistry} = this.keeper
        const aquarius = AquariusProvider.getAquarius()
        const brizo = BrizoProvider.getBrizo()

        const did: DID = DID.generate()
        const accessServiceDefinitionId: string = "0"
        const computeServiceDefintionId: string = "1"
        const metadataServiceDefinitionId: string = "2"

        metadata.base.contentUrls =
            [await SecretStoreProvider.getSecretStore()
                .encryptDocument(did.getId(), metadata.base.contentUrls)]

        const template = new Access()
        const serviceAgreementTemplate = new ServiceAgreementTemplate(template)

        const conditions: Condition[] = await serviceAgreementTemplate.getConditions(metadata, did.getId())

        const serviceEndpoint = aquarius.getServiceEndpoint(did)

        // create ddo itself
        const ddo: DDO = new DDO({
            authentication: [{
                type: "RsaSignatureAuthentication2018",
                publicKey: did.getDid() + "#keys-1",
            } as Authentication],
            id: did.getDid(),
            publicKey: [
                {
                    id: did.getDid() + "#keys-1",
                    type: "Ed25519VerificationKey2018",
                    owner: did.getDid(),
                    publicKeyBase58: await publisher.getPublicKey(),
                } as PublicKey,
            ],
            service: [
                {
                    type: template.templateName,
                    purchaseEndpoint: brizo.getPurchaseEndpoint(),
                    serviceEndpoint: brizo.getConsumeEndpoint(),
                    // the id of the service agreement?
                    serviceDefinitionId: accessServiceDefinitionId,
                    // the id of the service agreement template
                    templateId: serviceAgreementTemplate.getId(),
                    serviceAgreementContract: {
                        contractName: "ServiceAgreement",
                        fulfillmentOperator: template.fulfillmentOperator,
                        events: [
                            {
                                name: "ExecuteAgreement",
                                actorType: "consumer",
                                handler: {
                                    moduleName: "payment",
                                    functionName: "lockPayment",
                                    version: "0.1",
                                } as EventHandler,
                            } as Event,
                        ],
                    } as Contract,
                    conditions,
                } as Service,
                {
                    type: "Compute",
                    serviceEndpoint: brizo.getComputeEndpoint(publisher.getId(),
                        computeServiceDefintionId, "xxx", "xxx"),
                    serviceDefinitionId: computeServiceDefintionId,
                } as Service,
                {
                    type: "Metadata",
                    serviceEndpoint,
                    serviceDefinitionId: metadataServiceDefinitionId,
                    metadata,
                } as Service,
            ],
        })

        const storedDdo = await aquarius.storeDDO(ddo)

        // Logger.log(JSON.stringify(storedDdo, null, 2))

        await didRegistry.registerAttribute(
            did.getId(),
            ValueType.URL,
            "Metadata",
            serviceEndpoint,
            publisher.getId())

        return storedDdo
    }

    public async signServiceAgreement(did: string,
                                      serviceDefinitionId: string,
                                      consumer: Account): Promise<any> {

        const d: DID = DID.parse(did as string)
        const ddo = await AquariusProvider.getAquarius().retrieveDDO(d)
        const serviceAgreementId: string = IdGenerator.generateId()

        try {
            const serviceAgreementSignature: string = await ServiceAgreement.signServiceAgreement(
                ddo, serviceDefinitionId, serviceAgreementId, consumer)

            const accessService: Service = ddo.findServiceByType("Access")
            const metadataService: Service = ddo.findServiceByType("Metadata")

            const price = metadataService.metadata.base.price
            const balance = await consumer.getOceanBalance()
            if (balance < price) {
                throw new Error(`Not enough ocean tokens! Should have ${price} but has ${balance}`)
            }

            const event: ContractEvent = EventListener.subscribe(
                accessService.serviceAgreementContract.contractName,
                accessService.serviceAgreementContract.events[0].name, {
                    serviceAgreementId,
                })

            event.listenOnce(async (data) => {

                const sa: ServiceAgreement = new ServiceAgreement(data.returnValues.serviceAgreementId)
                await sa.payAsset(
                    d.getId(),
                    metadataService.metadata.base.price,
                    consumer,
                )
                Logger.log("Completed asset payment, now access should be granted.")
            })

            return {
                serviceAgreementId,
                serviceAgreementSignature,
            }

        } catch (err) {
            Logger.error("Signing ServiceAgreement failed!", err)
        }
    }

    public async initializeServiceAgreement(did: string,
                                            serviceDefinitionId: string,
                                            serviceAgreementId: string,
                                            serviceAgreementSignature: string,
                                            cb,
                                            consumer: Account) {

        const d: DID = DID.parse(did)
        const ddo = await AquariusProvider.getAquarius().retrieveDDO(d)

        const accessService: Service = ddo.findServiceByType("Access")
        const metadataService: Service = ddo.findServiceByType("Metadata")

        const accessEvent: ContractEvent = EventListener.subscribe(
            accessService.conditions[1].contractName,
            accessService.conditions[1].events[1].name, {})

        accessEvent.listenOnce(async () => {
            Logger.log("Awesome; got a AccessGranted Event. Let's download the asset files.")
            const contentUrls = await SecretStoreProvider
                .getSecretStore()
                .decryptDocument(d.getId(), metadataService.metadata.base.contentUrls[0])
            const serviceUrl: string = accessService.serviceEndpoint
            Logger.log("Consuming asset files using service url: ", serviceUrl)
            const files = []

            for (const cUrl of contentUrls) {
                let url: string = serviceUrl + `?url=${cUrl}`
                url = url + `&serviceAgreementId=${serviceAgreementId}`
                url = url + `&consumerAddress=${consumer.getId()}`
                files.push(url)
            }

            cb(files)
        })

        await BrizoProvider
            .getBrizo()
            .initializeServiceAgreement(
                did,
                serviceAgreementId,
                serviceDefinitionId,
                serviceAgreementSignature,
                consumer.getId())
    }

    public async executeServiceAgreement(did: string,
                                         serviceDefinitionId: string,
                                         serviceAgreementId: string,
                                         serviceAgreementSignature: string,
                                         consumer: Account,
                                         publisher: Account): Promise<ServiceAgreement> {

        const d: DID = DID.parse(did)
        const ddo = await AquariusProvider.getAquarius().retrieveDDO(d)

        const serviceAgreement: ServiceAgreement = await ServiceAgreement
            .executeServiceAgreement(
                d,
                ddo,
                serviceDefinitionId,
                serviceAgreementId,
                serviceAgreementSignature,
                consumer,
                publisher)

        return serviceAgreement
    }

    public async searchAssets(query: SearchQuery): Promise<DDO[]> {
        return AquariusProvider.getAquarius().queryMetadata(query)
    }

    public async searchAssetsByText(text: string): Promise<DDO[]> {
        return AquariusProvider.getAquarius().queryMetadataByText({
            text,
            page: 0,
            offset: 100,
            query: {
                value: 1,
            },
            sort: {
                value: 1,
            },
        } as SearchQuery)
    }
}
