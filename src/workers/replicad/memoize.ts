
import memoizee from 'memoizee';
import { Shape } from 'replicad';
import { TopoDS_Shape } from "replicad-opencascadejs";

/* eslint-disable @typescript-eslint/no-explicit-any */
const OPTIONS = {
  max: 20,
  primitive: true,
  normalizer: function (args: any[]) {
    return JSON.stringify(args);
  },
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function memoize<T extends TopoDS_Shape>(
  fn: (...args: any[]) => Shape<T>, 
  memoizeOptions?: memoizee.Options<(...args: any[]) => Shape<T>>
): (...args: any[]) => Shape<T> {
  const options = memoizeOptions ? { ...OPTIONS, ...memoizeOptions } : OPTIONS;
  const memoized = memoizee(fn, options);
  return (...args: any[]) => {
    const result = memoized(...args);
    return result.clone();
  };
}
