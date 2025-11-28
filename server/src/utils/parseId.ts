export const parseId = (value: string) => {
  const id = Number(value);
  if (Number.isNaN(id) || id <= 0) {
    throw new Error("Invalid ID");
  }
  return id;
};
