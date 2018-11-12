import DDO from "../ddo/DDO"
import {Logger, Ocean} from "../squid"

(async () => {
    const ocean: Ocean = await Ocean.getInstance({
        nodeUri: "http://localhost:8545",
        aquariusUri: "http://localhost:5000",
        brizoUri: "https://localhost:8030",
        parityUri: "http://localhost:9545",
        secretStoreUri: "https://secret-store.dev-ocean.com",
        threshold: 2,
        password: "unittest",
        address: "0xed243adfb84a6626eba46178ccb567481c6e655d",
    })

    const result: DDO[] = await ocean.searchAssetsByText("Office Humidity")
    const names: string[] = result.map((res: DDO): string => {
        const service = res.service.find((srv) => srv.type === "Metadata")
        if (service && service.metadata) {
            return service.metadata.base.name
        }
    })

    Logger.log(names.length, names)
})()
