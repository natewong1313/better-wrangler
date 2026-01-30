import { worker } from "../bw.config";

export default {
	async fetch(req: Request, env: typeof worker.Env): Promise<Response> {
		return new Response("Hello World");
	},
};
