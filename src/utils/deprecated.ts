const warned = new Set<string>();

/** Expose a renamed field under its old name (read-only, not enumerable, warns once per process). */
export function withDeprecatedAlias<T extends object>(target: T, oldName: string, newName: keyof T & string): T {
  Object.defineProperty(target, oldName, {
    enumerable: false,
    get() {
      if (!warned.has(oldName)) {
        warned.add(oldName);
        process.emitWarning(`${oldName} is deprecated; use ${newName}`, 'DeprecationWarning');
      }
      return target[newName];
    },
  });
  return target;
}
