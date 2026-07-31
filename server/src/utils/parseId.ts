/**
 * Parses a route parameter into a positive integer id.
 *
 * Accepts `undefined` because that is how Express types a route param; a
 * missing one is rejected the same way any other bad value is.
 */
export const parseId = (value: string | undefined) => {
  if (value === undefined || value.trim() === "") {
    throw new Error("Invalid ID");
  }

  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Invalid ID");
  }
  return id;
};
