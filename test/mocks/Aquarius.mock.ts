import Aquarius from "../../src/aquarius/Aquarius"

export default class AquariusMock extends Aquarius {

    public async getAccessUrl(accessToken: any, payload: any): Promise<string> {
        return "http://test/test"
    }
}