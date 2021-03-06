import {assert} from "chai"
import ConfigProvider from "../../src/ConfigProvider"
import Condition from "../../src/ddo/Condition"
import DDO from "../../src/ddo/DDO"
import MetaData from "../../src/ddo/MetaData"
import Service from "../../src/ddo/Service"
import Account from "../../src/ocean/Account"
import DID from "../../src/ocean/DID"
import IdGenerator from "../../src/ocean/IdGenerator"
import Ocean from "../../src/ocean/Ocean"
import ServiceAgreement from "../../src/ocean/ServiceAgreements/ServiceAgreement"
import ServiceAgreementTemplate from "../../src/ocean/ServiceAgreements/ServiceAgreementTemplate"
import Access from "../../src/ocean/ServiceAgreements/Templates/Access"
import WebServiceConnectorProvider from "../../src/utils/WebServiceConnectorProvider"
import config from "../config"
import TestContractHandler from "../keeper/TestContractHandler"
import WebServiceConnectorMock from "../mocks/WebServiceConnector.mock"

let ocean: Ocean
let accounts: Account[]
let publisherAccount: Account
let consumerAccount: Account

let accessService: Service
let metaDataService: Service

const did: DID = DID.generate()

describe("ServiceAgreement", () => {

    before(async () => {
        ConfigProvider.setConfig(config)
        await TestContractHandler.prepareContracts()
        ocean = await Ocean.getInstance(config)
        accounts = await ocean.getAccounts()

        publisherAccount = accounts[1]
        consumerAccount = accounts[2]

        const metadata = new MetaData()
        const serviceAgreementTemplate: ServiceAgreementTemplate =
            new ServiceAgreementTemplate(new Access())

        const conditions: Condition[] = await serviceAgreementTemplate.getConditions(metadata, did.getId())

        accessService = {
            type: "Access",
            serviceDefinitionId: "0",
            templateId: serviceAgreementTemplate.getId(),
            conditions,
        } as Service

        metaDataService = {
            type: "MetaData",
            metadata,
        } as Service
    })

    describe("#signServiceAgreement()", () => {
        it("should sign an service agreement", async () => {

            const ddo = new DDO({id: did.getDid(), service: [accessService]})
            const serviceAgreementId: string = IdGenerator.generateId()

            // @ts-ignore
            WebServiceConnectorProvider.setConnector(new WebServiceConnectorMock(ddo))

            const serviceAgreementSignature: string =
                await ServiceAgreement.signServiceAgreement(ddo, accessService.serviceDefinitionId,
                    serviceAgreementId, consumerAccount)

            assert(serviceAgreementSignature)
            assert(serviceAgreementSignature.startsWith("0x"))
            assert(serviceAgreementSignature.length === 132)
        })
    })

    describe("#executeServiceAgreement()", () => {
        it("should execute an service agreement", async () => {

            const ddo = new DDO({id: did.getDid(), service: [accessService]})
            const serviceAgreementId: string = IdGenerator.generateId()

            // @ts-ignore
            WebServiceConnectorProvider.setConnector(new WebServiceConnectorMock(ddo))
            const serviceAgreementSignature: string =
                await ServiceAgreement.signServiceAgreement(ddo, accessService.serviceDefinitionId,
                    serviceAgreementId, consumerAccount)

            const serviceAgreement: ServiceAgreement =
                await ServiceAgreement.executeServiceAgreement(did, ddo, accessService.serviceDefinitionId,
                    serviceAgreementId, serviceAgreementSignature, consumerAccount, publisherAccount)
            assert(serviceAgreement)

            const serviceDefinitionId = serviceAgreement.getId()
            assert(serviceDefinitionId)
            assert(serviceDefinitionId !== did.getId())
        })
    })

    describe("#getStatus()", () => {
        it("should get the status of a newly created service agreement", async () => {

            const ddo = new DDO({id: did.getDid(), service: [accessService]})
            const serviceAgreementId: string = IdGenerator.generateId()

            // @ts-ignore
            WebServiceConnectorProvider.setConnector(new WebServiceConnectorMock(ddo))
            const serviceAgreementSignature: string =
                await ServiceAgreement.signServiceAgreement(ddo, accessService.serviceDefinitionId,
                    serviceAgreementId, consumerAccount)
            assert(serviceAgreementSignature)

            const serviceAgreement: ServiceAgreement =
                await ServiceAgreement.executeServiceAgreement(did, ddo, accessService.serviceDefinitionId,
                    serviceAgreementId, serviceAgreementSignature, consumerAccount, publisherAccount)
            assert(serviceAgreement)

            const status = await serviceAgreement.getStatus()
            assert(status === false)
        })
    })

    describe("#payAsset()", () => {
        it("should lock the payment in that service agreement", async () => {

            const ddo = new DDO({id: did.getDid(), service: [accessService, metaDataService]})
            const serviceAgreementId: string = IdGenerator.generateId()

            // @ts-ignore
            WebServiceConnectorProvider.setConnector(new WebServiceConnectorMock(ddo))

            const serviceAgreementSignature: string =
                await ServiceAgreement.signServiceAgreement(ddo, accessService.serviceDefinitionId,
                    serviceAgreementId, consumerAccount)
            assert(serviceAgreementSignature)

            const serviceAgreement: ServiceAgreement =
                await ServiceAgreement.executeServiceAgreement(did, ddo, accessService.serviceDefinitionId,
                    serviceAgreementId, serviceAgreementSignature, consumerAccount, publisherAccount)
            assert(serviceAgreement)

            // get funds
            await consumerAccount.requestTokens(metaDataService.metadata.base.price)

            const paid: boolean = await serviceAgreement.payAsset(did.getId(), metaDataService.metadata.base.price,
                consumerAccount)
            assert(paid)
        })
    })

    describe("#grantAccess()", () => {
        it("should grant access in that service agreement", async () => {

            const ddo = new DDO({id: did.getDid(), service: [accessService]})
            const serviceAgreementId: string = IdGenerator.generateId()

            // @ts-ignore
            WebServiceConnectorProvider.setConnector(new WebServiceConnectorMock(ddo))
            const serviceAgreementSignature: string =
                await ServiceAgreement.signServiceAgreement(ddo, accessService.serviceDefinitionId,
                    serviceAgreementId, consumerAccount)
            assert(serviceAgreementSignature)

            const serviceAgreement: ServiceAgreement =
                await ServiceAgreement.executeServiceAgreement(did, ddo, accessService.serviceDefinitionId,
                    serviceAgreementId, serviceAgreementSignature, consumerAccount, publisherAccount)
            assert(serviceAgreement)

            // get funds
            await consumerAccount.requestTokens(metaDataService.metadata.base.price)

            const paid: boolean = await serviceAgreement.payAsset(did.getId(), metaDataService.metadata.base.price,
                consumerAccount)
            assert(paid)

            // todo: use document id
            const accessGranted: boolean = await serviceAgreement.grantAccess(did.getId(), did.getId(),
                publisherAccount)
            assert(accessGranted)
        })

        it("should fail to grant grant access if there is no payment", async () => {

            const ddo = new DDO({id: did.getDid(), service: [accessService]})
            const serviceAgreementId: string = IdGenerator.generateId()

            // @ts-ignore
            WebServiceConnectorProvider.setConnector(new WebServiceConnectorMock(ddo))
            const serviceAgreementSignature: string =
                await ServiceAgreement.signServiceAgreement(ddo, accessService.serviceDefinitionId,
                    serviceAgreementId, consumerAccount)
            assert(serviceAgreementSignature)

            const serviceAgreement: ServiceAgreement =
                await ServiceAgreement.executeServiceAgreement(did, ddo, accessService.serviceDefinitionId,
                    serviceAgreementId, serviceAgreementSignature, consumerAccount, publisherAccount)
            assert(serviceAgreement)

            // todo: use document id
            const accessGranted: boolean = await serviceAgreement.grantAccess(did.getId(), did.getId(),
                publisherAccount)
            assert(!accessGranted)
        })
    })
})
