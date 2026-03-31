/**
 * Async push/pull queue. Producer calls push()/done(), consumer uses for-await.
 */
export function createChannel() {
  const queue = [];
  const waiters = [];
  let isDone = false;

  return {
    push(value) {
      if (waiters.length > 0) waiters.shift()(value);
      else queue.push(value);
    },
    done() {
      isDone = true;
      while (waiters.length > 0) waiters.shift()(Symbol.for('done'));
    },
    async *[Symbol.asyncIterator]() {
      while (true) {
        if (queue.length > 0) {
          yield queue.shift();
        } else if (isDone) {
          return;
        } else {
          const value = await new Promise(resolve => waiters.push(resolve));
          if (value === Symbol.for('done')) return;
          yield value;
        }
      }
    }
  };
}

/**
 * Merge two async iterables — yields from whichever has data first.
 * Completes when BOTH are exhausted.
 */
export async function* mergeAsyncIterables(iter1, iter2) {
  const channel = createChannel();
  let active = 2;

  const consume = async (iter) => {
    for await (const item of iter) channel.push(item);
    if (--active === 0) channel.done();
  };

  consume(iter1);
  consume(iter2);

  yield* channel;
}
