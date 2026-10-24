import { createServer } from "node:http";

/**
 * A queue the producer cannot reach.
 *
 * The constructor passes only `#enqueue` into the executor. Whoever produces
 * data never receives the queue, so they cannot dequeue, reorder, or read
 * what is buffered. Consumers call `dequeue()` on the instance they built.
 *
 * When a consumer is already waiting, the value is handed over directly.
 * Otherwise it sits in `#queue` until the next `dequeue()`.
 */
class TamperFreeQueue {
  // Values waiting for a consumer.
  #queue = [];
  // Resolvers from dequeue() calls that arrived before any data.
  #dataListeners = [];

  /**
   * Start the producer with access to enqueue and nothing else.
   *
   * @param {(enqueue: (data: unknown) => Promise<void>) => void} executor
   *   Called once with the bound enqueue function. It should start the
   *   source of items (here, an HTTP server) and call enqueue for each one.
   */
  constructor(executor) {
    executor(this.#enqueue.bind(this));
  }

  /**
   * Accept one item from the producer.
   *
   * A waiting consumer is resolved immediately, and the item never enters
   * the buffer. With no waiter, the item is stored for a later dequeue.
   * The promise settles once the item has been handed off or buffered.
   *
   * @param {unknown} data
   * @returns {Promise<void>}
   */
  #enqueue(data) {
    return new Promise((resolve) => {
      const firstWaiter = this.#dataListeners.shift();

      // A consumer is already parked in dequeue(); give it this item.
      if (firstWaiter) {
        firstWaiter(data);
        return resolve();
      }

      this.#queue.push(data);
      resolve();
    });
  }

  /**
   * Take the next item, waiting if the buffer is empty.
   *
   * @returns {Promise<unknown>}
   */
  dequeue() {
    return new Promise((resolve) => {
      const firstData = this.#queue.shift();

      // Buffered item is available; no need to wait for the producer.
      if (firstData) return resolve(firstData);

      // Park this resolver until #enqueue has something to deliver.
      this.#dataListeners.push(resolve);
    });
  }
}

// The producer only sees enqueue. The queue instance stays in this module.
const queue = new TamperFreeQueue((enqueue) => {
  const server = createServer((req, res) => {
    res.writeHead(200);

    req.setEncoding("utf-8");

    // Each readable chunk is one JSON value. The response ends only after
    // that value has been handed to the queue.
    req.on("readable", async () => {
      let chunk;
      while ((chunk = req.read()) !== null) {
        const data = JSON.parse(chunk);
        await enqueue(data);
      }

      res.end();
    });
  });

  server.listen(3000, () => console.log("Server started"));
});

/**
 * Pull items forever and log which worker received each one.
 *
 * @param {number} id Worker index, printed alongside each item.
 * @returns {Promise<void>}
 */
const worker = async (id) => {
  while (true) {
    const data = await queue.dequeue();

    console.log({ data, id });
  }
};

// Default to two workers. Pass a number as the first argument to change it.
const numWorkers = parseInt(process.argv[2]) || 2;

// Spin up multiple workers to consume queue data.
for (let i = 0; i < numWorkers; i++) {
  worker(i);
}
