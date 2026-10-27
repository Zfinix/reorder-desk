import { AsyncLocalStorage } from "node:async_hooks";
import { configureSync, getConsoleSink, getLogger } from "@logtape/logtape";
import type { ConsoleFormatter } from "@logtape/logtape";

const serialise = (value: unknown) =>
  value instanceof Error ? { name: value.name, message: value.message, stack: value.stack } : value;

const structured: ConsoleFormatter = (record) => [
  {
    level: record.level,
    logger: record.category.join("."),
    message: record.rawMessage,
    ...Object.fromEntries(Object.entries(record.properties).map(([key, value]) => [key, serialise(value)])),
  },
];

configureSync({
  sinks: { console: getConsoleSink({ formatter: structured }) },
  loggers: [
    { category: "reorder-desk", sinks: ["console"], lowestLevel: "info" },
    { category: ["logtape", "meta"], sinks: ["console"], lowestLevel: "warning" },
  ],
  contextLocalStorage: new AsyncLocalStorage(),
});

export const logger = (name: string) => getLogger(["reorder-desk", name]);
