import Config from "./models/Config"

export default class ConfigProvider {

    public static getConfig() {
        return ConfigProvider.config
    }

    public static configure(config: Config) {

        ConfigProvider.config = config
    }

    private static config: Config
}