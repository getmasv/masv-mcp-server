export function mcpOk(data: object | string) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

export function mcpError(data: unknown) {
  const message = data instanceof Error ? data.message : String(data);

  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}
