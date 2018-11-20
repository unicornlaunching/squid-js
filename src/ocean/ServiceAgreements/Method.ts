export default class Method {
    public name: string
    public contractName: string
    public methodName: string
    public timeout: number
    public dependencies: string[]
    public dependencyTimeoutFlags: number[]
    public isTerminalCondition: boolean
}
