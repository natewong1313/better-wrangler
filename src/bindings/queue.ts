/**
 * Queue Producer - for sending messages to a queue
 */
type QueueProducerProps = {
  /** Binding name that will be available in env (e.g., env.MY_QUEUE) */
  name: string;
  /** Queue name in Cloudflare, or reference to a QueueConsumer binding */
  queue: string | QueueConsumerBinding;
  /** Default delivery delay in seconds (0-43200, max 12 hours) */
  deliveryDelay?: number;
};

export type QueueProducerBinding = {
  _type: "QueueProducer";
  _runtimeType: Queue<unknown>;
  name: string;
  queue: string;
  deliveryDelay?: number;
};

export const QueueProducer = (props: QueueProducerProps): QueueProducerBinding => ({
  _type: "QueueProducer",
  _runtimeType: null as unknown as Queue<unknown>,
  name: props.name,
  queue: typeof props.queue === "string" ? props.queue : props.queue.queue,
  deliveryDelay: props.deliveryDelay,
});

/**
 * Queue Consumer - for receiving messages from a queue
 */
type QueueConsumerProps = {
  /** Queue name in Cloudflare */
  queue: string;
  /** Maximum number of messages per batch (1-100, default 10) */
  maxBatchSize?: number;
  /** Maximum seconds to wait for a full batch (0-60, default 5) */
  maxBatchTimeout?: number;
  /** Maximum retry attempts before sending to DLQ (default 3) */
  maxRetries?: number;
  /** Dead letter queue name or reference to another QueueConsumer */
  deadLetterQueue?: string | QueueConsumerBinding;
  /** Seconds to wait before retrying a failed message */
  retryDelay?: number;
  /** Consumer type: 'push' (Worker handler) or 'http_pull' (HTTP API) */
  type?: "push" | "http_pull";
};

export type QueueConsumerBinding = {
  _type: "QueueConsumer";
  _runtimeType: null;
  queue: string;
  maxBatchSize?: number;
  maxBatchTimeout?: number;
  maxRetries?: number;
  deadLetterQueue?: string;
  retryDelay?: number;
  consumerType: "push" | "http_pull";
};

export const QueueConsumer = (props: QueueConsumerProps): QueueConsumerBinding => ({
  _type: "QueueConsumer",
  _runtimeType: null,
  queue: props.queue,
  maxBatchSize: props.maxBatchSize,
  maxBatchTimeout: props.maxBatchTimeout,
  maxRetries: props.maxRetries,
  deadLetterQueue:
    typeof props.deadLetterQueue === "string"
      ? props.deadLetterQueue
      : props.deadLetterQueue?.queue,
  retryDelay: props.retryDelay,
  consumerType: props.type ?? "push",
});
