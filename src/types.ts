import type { Input as MainInput, Output as MainOutput } from "../ejs/src/yt/solver/main.ts";

export interface SignatureRequest {
    encrypted_signature: string;
    n_param: string;
    player_url: string;
}

export interface SignatureResponse {
    decrypted_signature: string;
    decrypted_n_sig: string;
}

export interface StsRequest {
    player_url: string;
}

export interface StsResponse {
    sts: string;
}

export interface WorkerWithStatus extends Worker {
    isIdle?: boolean;
}

export interface Task {
    data: MainInput;
    resolve: (output: MainOutput) => void;
    reject: (error: any) => void;
}

export type ApiRequest = SignatureRequest | StsRequest;

// Parsing into this context helps avoid multi copies of requests
// since request body can only be read once. 
export interface RequestContext {
    req: Request;
    body: ApiRequest;
}