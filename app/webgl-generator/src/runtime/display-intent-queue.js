export function createLatestDisplayIntentQueue() {
  let latestSequence = 0;
  let tail = Promise.resolve();

  return Object.freeze({run, getSnapshot});

  function run(task) {
    const sequence = ++latestSequence;
    const execute = async () => {
      if (sequence !== latestSequence) throw supersededError(sequence, latestSequence);
      const context = Object.freeze({sequence, isCurrent: () => sequence === latestSequence});
      try {
        return await task(context);
      } catch (error) {
        if (!context.isCurrent()) throw supersededError(sequence, latestSequence, error);
        throw error;
      }
    };
    const result = tail.catch(() => {}).then(execute);
    tail = result.catch(() => {});
    return result;
  }

  function getSnapshot() {
    return {latestSequence};
  }
}

export function isSupersededDisplayIntent(error) {
  return error?.code === "operation_obsolete" && error?.details?.displayIntentSuperseded === true;
}

function supersededError(sequence, latestSequence, cause) {
  const error = new Error("显示意图已被更新的设置取代", cause ? {cause} : undefined);
  error.code = "operation_obsolete";
  error.stage = "display-intent";
  error.suggestion = "以最后一次显示设置为准。";
  error.expected = true;
  error.details = {displayIntentSuperseded: true, sequence, latestSequence};
  return error;
}
