export {};

declare global {
  const Deno: {
    env: {
      get(key: string): string | undefined;
    };
    serve(
      handler: (req: Request) => Response | Promise<Response>,
    ): unknown;
  };
}
