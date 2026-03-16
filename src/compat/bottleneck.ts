import { Sluice } from "../sluice.js";
import { Group } from "../group.js";
import { Strategy, DEFAULT_PRIORITY } from "../types.js";
import type { SluiceOptions, JobOptions, GroupOptions } from "../types.js";

/**
 * Bottleneck compatibility layer.
 *
 * Drop-in replacement: change `import Bottleneck from "bottleneck"`
 * to `import Bottleneck from "@agentine/sluice/compat/bottleneck"`.
 *
 * All constructor options, methods, and events match the bottleneck v2.19.5 API.
 */
class Bottleneck extends Sluice {
  /** Strategy enum — LEAK=1, OVERFLOW=2, BLOCK=3 (matches bottleneck) */
  static readonly Strategy = Strategy;

  /** Group class (keyed limiter factory) — matches Bottleneck.Group */
  static readonly Group = Group;

  /** Default priority level (5) */
  static readonly DEFAULT_PRIORITY = DEFAULT_PRIORITY;

  constructor(options?: SluiceOptions) {
    super(options);
  }
}

// Named + default exports matching bottleneck's module shape
export { Bottleneck, Group, Strategy };
export type { SluiceOptions as BottleneckOptions, JobOptions, GroupOptions };
export default Bottleneck;
