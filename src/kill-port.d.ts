declare module 'kill-port' {
  export default function killPort(port: number, protocol?: string): Promise<void>;
}
