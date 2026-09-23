// The small part of the WebExtension API this connector uses, declared
// locally so the extension has no runtime or type dependencies. Chrome and
// Firefox both provide these under `chrome.*` with promise-based methods.
declare namespace chrome {
  namespace storage {
    interface StorageArea {
      get(keys: string | string[] | null): Promise<Record<string, unknown>>
      set(items: Record<string, unknown>): Promise<void>
      remove(keys: string | string[]): Promise<void>
    }
    const local: StorageArea
  }
  namespace alarms {
    interface Alarm {
      name: string
    }
    function create(
      name: string,
      info: { delayInMinutes?: number; periodInMinutes?: number },
    ): Promise<void>
    function clear(name: string): Promise<boolean>
    const onAlarm: { addListener(callback: (alarm: Alarm) => void): void }
  }
  namespace runtime {
    interface MessageSender {
      id?: string
      tab?: { id?: number; url?: string }
    }
    function sendMessage(message: unknown): Promise<unknown>
    function getManifest(): { version: string }
    function getPlatformInfo(): Promise<{ os: string }>
    function getURL(path: string): string
    const onMessage: {
      addListener(
        callback: (
          message: unknown,
          sender: MessageSender,
          sendResponse: (response: unknown) => void,
        ) => boolean | undefined,
      ): void
    }
    const onInstalled: {
      addListener(callback: (details: { reason: string }) => void): void
    }
    const onStartup: { addListener(callback: () => void): void }
  }
  namespace permissions {
    function request(permissions: { origins: string[] }): Promise<boolean>
    function contains(permissions: { origins: string[] }): Promise<boolean>
  }
  namespace tabs {
    interface Tab {
      id?: number
      url?: string
      status?: string
      discarded?: boolean
    }
    function query(query: { url?: string | string[] }): Promise<Tab[]>
    function create(properties: { url: string; active?: boolean }): Promise<Tab>
    function get(tabId: number): Promise<Tab>
    function remove(tabId: number): Promise<void>
    const onUpdated: {
      addListener(
        callback: (tabId: number, info: { status?: string }) => void,
      ): void
      removeListener(
        callback: (tabId: number, info: { status?: string }) => void,
      ): void
    }
  }
  namespace scripting {
    function executeScript<Args extends unknown[], Result>(injection: {
      target: { tabId: number }
      world?: 'MAIN' | 'ISOLATED'
      func: (...args: Args) => Result
      args: Args
    }): Promise<Array<{ result?: Awaited<Result> }>>
  }
  namespace notifications {
    function create(
      id: string,
      options: {
        type: 'basic'
        iconUrl: string
        title: string
        message: string
      },
    ): Promise<string>
  }
}
