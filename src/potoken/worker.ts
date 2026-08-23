import { fetch_pot } from "./botguard.ts";


self.onmessage = async (e: MessageEvent<{ id: number; contentBinding: string }>) => {
    const { id, contentBinding } = e.data;

    try {
        self.postMessage({ id, type: 'success', data: await fetch_pot(contentBinding) });
    } catch (error) {
        self.postMessage({
            id,
            type: 'error',
            data: { message: error instanceof Error ? error.message : String(error) },
        });
    }
};
