import { Sluice } from "../sluice.js";
import { Group } from "../group.js";
import { Strategy } from "../types.js";
import type { SluiceOptions, JobOptions, GroupOptions } from "../types.js";

// Bottleneck compatibility — re-export Sluice as Bottleneck
class Bottleneck extends Sluice {
  static readonly Strategy = Strategy;
  static readonly Group = Group;

  constructor(options?: SluiceOptions) {
    super(options);
  }
}

export { Bottleneck, Group, Strategy };
export type { SluiceOptions as BottleneckOptions, JobOptions, GroupOptions };
export default Bottleneck;
