import { request } from "node:https";
import { Readable } from "node:stream";

/**
 * Fluent builder for a single outbound HTTPS request.
 *
 * The method and URL are fixed at construction. header(), query(), and
 * body() accumulate the rest of the request and return the builder so
 * the call site stays a single chain. invoke() sends it.
 */
class RequestBuilder {
  // Private bag of options. Callers never touch this directly.
  #request = {};

  constructor(method, url) {
    this.#request["method"] = method;
    this.#request["url"] = url;
  }

  // Record one header, creating the headers map the first time it is needed.
  header(key, value) {
    let headers = this.#request["headers"];

    if (!headers) headers = this.#request["headers"] = {};

    headers[key] = value;

    return this;
  }

  // Record one query parameter. Serialization happens later, in invoke().
  query(key, value) {
    let queryParams = this.#request["queryParams"];

    if (!queryParams) queryParams = this.#request["queryParams"] = {};

    queryParams[key] = value;

    return this;
  }

  // Attach a payload. It is JSON-encoded when the request is written.
  body(data) {
    this.#request["body"] = data;

    return this;
  }

  /**
   * Open the connection and resolve with a MyResponse.
   *
   * Query parameters are appended to the URL first. A malformed URL
   * rejects immediately. The body is written only when one was set and
   * the method is not GET. Socket errors reject the same promise.
   */
  invoke() {
    const search = new URLSearchParams(this.#request.queryParams).toString();

    return new Promise((resolve, reject) => {
      let url;

      try {
        url = new URL(
          search ? `${this.#request.url}?${search}` : this.#request.url,
        );
      } catch (error) {
        return reject(error);
      }

      const req = request(
        url,
        {
          method: this.#request.method,
          headers: this.#request.headers,
        },
        (res) => resolve(new MyResponse(res)),
      );

      if (this.#request.body && this.#request.method !== "get")
        req.write(JSON.stringify(this.#request.body));

      req.on("error", (err) => reject(err));
      req.end();
    });
  }
}

/**
 * View of an incoming HTTPS response.
 *
 * status, headers, and a web ReadableStream are available immediately.
 * The stream is also drained in the background into one buffer, so
 * json() and text() can be awaited whether or not the body has finished
 * arriving.
 */
class MyResponse {
  #buffer;
  // Handlers waiting on a completed body, or on a read failure.
  #responseListeners = [];
  #errorListeners = [];

  constructor(res) {
    // Adapt Node's IncomingMessage so callers can use the web streams API.
    this.body = Readable.toWeb(res);
    this.statusCode = res.statusCode;
    this.statusText = res.statusMessage;
    this.headers = res.headers;
    this.#collectData();
  }

  /**
   * Read the response to completion and notify anyone waiting on it.
   *
   * Chunks are kept as they arrive. Once the stream ends they are joined
   * into a Node Buffer, or into a Uint8Array when running in a browser.
   * Success and error listeners are then flushed and dropped so each
   * response notifies its consumers only once.
   */
  async #collectData() {
    const reader = this.body.getReader();
    const chunks = [];
    let len = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          this.#buffer = (() => {
            // NodeJs environment.
            if (!global.window) return Buffer.concat(chunks);

            const arr = new Uint8Array(len);
            let offset = 0;

            for (const chunk of chunks) {
              arr.set(chunk, offset);
              offset += chunk.length;
            }

            return arr;
          })();

          // Notify all listeners that were waiting on the response.
          for (const listener of this.#responseListeners)
            listener(this.#buffer);

          // Clear the listeners to prevent memory leaks.
          this.#responseListeners = [];
          this.#errorListeners = [];
          break;
        }

        chunks.push(value);
        len += value.length;
      }
    } catch (error) {
      // Notify all listeners that were waiting on the error.
      for (const listener of this.#errorListeners) listener(error);
      this.#responseListeners = [];
      this.#errorListeners = [];
    } finally {
      reader.releaseLock();
    }
  }

  // This mimicks the consumer utils available in the node.js stream API and
  // fetch. The main initial goal was to make an implementation similar to fetch

  // Parse the full body as JSON. The browser path decodes to text first.
  async json() {
    // In the browser, we decode to text first and then parse.
    if (global.window) return JSON.parse(await this.text());

    // Calling parse on the node.js buffer works so we keep that simple!
    return await this.#consumer((data) => JSON.parse(data));
  }

  // Decode the full body as a string.
  text() {
    return this.#consumer((data) => {
      // Node.js environment. buffer.toString() does the magic!
      if (!global.window) return data.toString();

      // Browser environment.
      const decoder = new TextDecoder();

      return decoder.decode(data);
    });
  }

  /**
   * Apply fn to the buffered body.
   *
   * If collection has already finished, fn runs at once. Otherwise the
   * promise stays pending until #collectData succeeds or fails.
   */
  #consumer(fn) {
    return new Promise((resolve, reject) => {
      const res = (data) => resolve(fn(data));

      if (this.#buffer) return res(this.#buffer);

      this.#responseListeners.push(res);
      this.#errorListeners.push(reject);
    });
  }
}

/**
 * Starting point for a request.
 *
 * The class itself has no methods of its own. The loop below installs
 * one factory per verb, each returning a RequestBuilder bound to that verb.
 */
class MyRequest {}

// Add factory methods for each HTTP method. Makes it easier this way since they
// are all similar but we lose the javascript typing but thats ok.
const METHODS = ["get", "post", "delete", "patch"];
for (const method of METHODS) {
  MyRequest.prototype[method] = function (url) {
    return new RequestBuilder(method, url);
  };
}

// Example: GET https://www.google.com?search=star%2Csun&name=someone
const res = await new MyRequest()
  .get("https://www.google.com")
  .query("search", ["star", "sun"])
  .query("name", "someone")
  .invoke();

const data = await res.text();

console.log({ data });
