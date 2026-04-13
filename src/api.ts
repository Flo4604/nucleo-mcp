const SYNC_API = "https://nucleo-team-sync.uc.r.appspot.com/";

export async function nucleoApi(
	method: "GET" | "POST",
	path: string,
	body?: Record<string, unknown>,
): Promise<unknown> {
	const url = `${SYNC_API}${path}`;
	const opts: RequestInit = {
		method,
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
	};
	if (method === "POST" && body) {
		opts.body = new URLSearchParams(
			Object.entries(body).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]),
		);
	}
	const res = await fetch(url, opts);
	if (!res.ok) {
		throw new Error(`Nucleo API ${method} ${path}: ${res.status} ${await res.text()}`);
	}
	return res.json();
}
