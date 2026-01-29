import { describe, it, expect } from "vitest";
import { QueueProducer, QueueConsumer } from "../../../src/bindings/queue";
import type { QueueProducerBinding, QueueConsumerBinding } from "../../../src/bindings/queue";

describe("QueueProducer", () => {
	it("creates a QueueProducer binding with the correct type", () => {
		const binding = QueueProducer({ name: "MY_QUEUE", queue: "my-queue" });

		expect(binding._type).toBe("QueueProducer");
	});

	it("sets the binding name correctly", () => {
		const binding = QueueProducer({ name: "ORDER_QUEUE", queue: "orders" });

		expect(binding.name).toBe("ORDER_QUEUE");
	});

	it("sets the queue name correctly when provided as string", () => {
		const binding = QueueProducer({ name: "MY_QUEUE", queue: "my-queue-name" });

		expect(binding.queue).toBe("my-queue-name");
	});

	it("includes _runtimeType property for type inference", () => {
		const binding = QueueProducer({ name: "MY_QUEUE", queue: "my-queue" });

		expect(binding).toHaveProperty("_runtimeType");
	});

	it("stores deliveryDelay when provided", () => {
		const binding = QueueProducer({
			name: "MY_QUEUE",
			queue: "my-queue",
			deliveryDelay: 60,
		});

		expect(binding.deliveryDelay).toBe(60);
	});

	it("deliveryDelay is undefined when not provided", () => {
		const binding = QueueProducer({ name: "MY_QUEUE", queue: "my-queue" });

		expect(binding.deliveryDelay).toBeUndefined();
	});

	it("accepts maximum deliveryDelay (12 hours = 43200 seconds)", () => {
		const binding = QueueProducer({
			name: "MY_QUEUE",
			queue: "my-queue",
			deliveryDelay: 43200,
		});

		expect(binding.deliveryDelay).toBe(43200);
	});

	describe("cross-worker queue references", () => {
		it("extracts queue name from QueueConsumer reference", () => {
			const consumer = QueueConsumer({ queue: "shared-queue" });
			const producer = QueueProducer({ name: "MY_QUEUE", queue: consumer });

			expect(producer.queue).toBe("shared-queue");
		});

		it("allows type-safe producer-consumer pairing", () => {
			const orderQueue = QueueConsumer({
				queue: "order-processing",
				maxRetries: 5,
			});

			const producer = QueueProducer({
				name: "ORDER_QUEUE",
				queue: orderQueue,
			});

			expect(producer.queue).toBe("order-processing");
		});
	});
});

describe("QueueConsumer", () => {
	it("creates a QueueConsumer binding with the correct type", () => {
		const binding = QueueConsumer({ queue: "my-queue" });

		expect(binding._type).toBe("QueueConsumer");
	});

	it("sets the queue name correctly", () => {
		const binding = QueueConsumer({ queue: "order-processing" });

		expect(binding.queue).toBe("order-processing");
	});

	it("has null _runtimeType (consumers don't expose env binding)", () => {
		const binding = QueueConsumer({ queue: "my-queue" });

		expect(binding._runtimeType).toBeNull();
	});

	describe("push consumer (default)", () => {
		it("defaults to push consumer type", () => {
			const binding = QueueConsumer({ queue: "my-queue" });

			expect(binding.consumerType).toBe("push");
		});

		it("explicitly sets push consumer type", () => {
			const binding = QueueConsumer({ queue: "my-queue", type: "push" });

			expect(binding.consumerType).toBe("push");
		});
	});

	describe("http_pull consumer", () => {
		it("sets http_pull consumer type when specified", () => {
			const binding = QueueConsumer({ queue: "my-queue", type: "http_pull" });

			expect(binding.consumerType).toBe("http_pull");
		});

		it("works with all options for http_pull consumers", () => {
			const binding = QueueConsumer({
				queue: "pull-queue",
				type: "http_pull",
				maxBatchSize: 50,
				maxBatchTimeout: 30,
			});

			expect(binding.consumerType).toBe("http_pull");
			expect(binding.maxBatchSize).toBe(50);
			expect(binding.maxBatchTimeout).toBe(30);
		});
	});

	describe("batch configuration", () => {
		it("stores maxBatchSize when provided", () => {
			const binding = QueueConsumer({
				queue: "my-queue",
				maxBatchSize: 50,
			});

			expect(binding.maxBatchSize).toBe(50);
		});

		it("stores maxBatchTimeout when provided", () => {
			const binding = QueueConsumer({
				queue: "my-queue",
				maxBatchTimeout: 30,
			});

			expect(binding.maxBatchTimeout).toBe(30);
		});

		it("maxBatchSize and maxBatchTimeout are undefined when not provided", () => {
			const binding = QueueConsumer({ queue: "my-queue" });

			expect(binding.maxBatchSize).toBeUndefined();
			expect(binding.maxBatchTimeout).toBeUndefined();
		});

		it("accepts minimum batch size (1)", () => {
			const binding = QueueConsumer({
				queue: "my-queue",
				maxBatchSize: 1,
			});

			expect(binding.maxBatchSize).toBe(1);
		});

		it("accepts maximum batch size (100)", () => {
			const binding = QueueConsumer({
				queue: "my-queue",
				maxBatchSize: 100,
			});

			expect(binding.maxBatchSize).toBe(100);
		});

		it("accepts maximum batch timeout (60 seconds)", () => {
			const binding = QueueConsumer({
				queue: "my-queue",
				maxBatchTimeout: 60,
			});

			expect(binding.maxBatchTimeout).toBe(60);
		});
	});

	describe("retry configuration", () => {
		it("stores maxRetries when provided", () => {
			const binding = QueueConsumer({
				queue: "my-queue",
				maxRetries: 5,
			});

			expect(binding.maxRetries).toBe(5);
		});

		it("stores retryDelay when provided", () => {
			const binding = QueueConsumer({
				queue: "my-queue",
				retryDelay: 120,
			});

			expect(binding.retryDelay).toBe(120);
		});

		it("maxRetries and retryDelay are undefined when not provided", () => {
			const binding = QueueConsumer({ queue: "my-queue" });

			expect(binding.maxRetries).toBeUndefined();
			expect(binding.retryDelay).toBeUndefined();
		});

		it("accepts zero retries (fail immediately)", () => {
			const binding = QueueConsumer({
				queue: "my-queue",
				maxRetries: 0,
			});

			expect(binding.maxRetries).toBe(0);
		});
	});

	describe("dead letter queue", () => {
		it("stores deadLetterQueue when provided as string", () => {
			const binding = QueueConsumer({
				queue: "my-queue",
				deadLetterQueue: "my-dlq",
			});

			expect(binding.deadLetterQueue).toBe("my-dlq");
		});

		it("extracts queue name from QueueConsumer reference", () => {
			const dlq = QueueConsumer({ queue: "failed-orders" });
			const binding = QueueConsumer({
				queue: "orders",
				deadLetterQueue: dlq,
			});

			expect(binding.deadLetterQueue).toBe("failed-orders");
		});

		it("deadLetterQueue is undefined when not provided", () => {
			const binding = QueueConsumer({ queue: "my-queue" });

			expect(binding.deadLetterQueue).toBeUndefined();
		});
	});

	describe("full configuration", () => {
		it("stores all options when provided", () => {
			const binding = QueueConsumer({
				queue: "order-processing",
				maxBatchSize: 50,
				maxBatchTimeout: 30,
				maxRetries: 5,
				deadLetterQueue: "order-dlq",
				retryDelay: 60,
				type: "push",
			});

			expect(binding.queue).toBe("order-processing");
			expect(binding.maxBatchSize).toBe(50);
			expect(binding.maxBatchTimeout).toBe(30);
			expect(binding.maxRetries).toBe(5);
			expect(binding.deadLetterQueue).toBe("order-dlq");
			expect(binding.retryDelay).toBe(60);
			expect(binding.consumerType).toBe("push");
		});
	});
});

describe("type safety", () => {
	it("QueueProducerBinding has correct shape", () => {
		const binding: QueueProducerBinding = {
			_type: "QueueProducer",
			_runtimeType: null as unknown as Queue<unknown>,
			name: "MY_QUEUE",
			queue: "my-queue",
			deliveryDelay: 60,
		};

		expect(binding._type).toBe("QueueProducer");
		expect(binding.name).toBe("MY_QUEUE");
		expect(binding.queue).toBe("my-queue");
		expect(binding.deliveryDelay).toBe(60);
	});

	it("QueueConsumerBinding has correct shape", () => {
		const binding: QueueConsumerBinding = {
			_type: "QueueConsumer",
			_runtimeType: null,
			queue: "my-queue",
			maxBatchSize: 50,
			maxBatchTimeout: 30,
			maxRetries: 5,
			deadLetterQueue: "my-dlq",
			retryDelay: 60,
			consumerType: "push",
		};

		expect(binding._type).toBe("QueueConsumer");
		expect(binding.queue).toBe("my-queue");
		expect(binding.consumerType).toBe("push");
	});

	it("QueueConsumerBinding works with http_pull type", () => {
		const binding: QueueConsumerBinding = {
			_type: "QueueConsumer",
			_runtimeType: null,
			queue: "pull-queue",
			consumerType: "http_pull",
		};

		expect(binding.consumerType).toBe("http_pull");
	});

	it("factory functions return correct types", () => {
		const producer: QueueProducerBinding = QueueProducer({
			name: "MY_QUEUE",
			queue: "my-queue",
		});

		const consumer: QueueConsumerBinding = QueueConsumer({
			queue: "my-queue",
		});

		expect(producer._type).toBe("QueueProducer");
		expect(consumer._type).toBe("QueueConsumer");
	});

	it("different binding names are distinguishable", () => {
		const binding1 = QueueProducer({ name: "QUEUE_A", queue: "queue-a" });
		const binding2 = QueueProducer({ name: "QUEUE_B", queue: "queue-b" });

		expect(binding1.name).not.toBe(binding2.name);
		expect(binding1.queue).not.toBe(binding2.queue);
	});
});
