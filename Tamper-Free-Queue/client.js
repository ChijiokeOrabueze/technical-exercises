import { request } from "node:http";

/**
 * Post one payload to the Tamper-Free Queue server.
 *
 * The first argument is written as the request body and is expected to be
 * JSON. The server parses that body and enqueues the value for a worker.
 *
 * Usage: node client.js '{"job":1}'
 */

// Raw body to enqueue. Passed through unchanged.
const data = process.argv[2];

const req = request("http://localhost:3000", { method: "post" });

// Send the payload and close the request so the server can finish reading it.
req.write(data);
req.end();
