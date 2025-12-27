
export const decimalToNumberTransformer = {
    to: (value: number) => value, // when saving
    from: (value: string | null) => value === null ? null : parseFloat(value), // when reading
};
