import { preprocessPlayer } from "./ejs/src/yt/solver/solvers.ts";

self.onmessage = (e: MessageEvent<string>) => {
    try {
        const output = preprocessPlayer(e.data);
        self.postMessage({ type: 'success', data: output });
    } catch (error) {
        self.postMessage({
            type: 'error',
            data: {
                message: error,
            }
        });
    }
};