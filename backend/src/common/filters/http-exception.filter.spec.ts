import { ArgumentsHost, HttpException, HttpStatus } from "@nestjs/common";
import { HttpExceptionFilter } from "./http-exception.filter";

function fakeHost(requestId?: string): { host: ArgumentsHost; status: jest.Mock; json: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ id: requestId, method: "GET", originalUrl: "/whatever" }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe("HttpExceptionFilter", () => {
  it("passes an HttpException's own status and body straight through", () => {
    const filter = new HttpExceptionFilter();
    const { host, status, json } = fakeHost("req-1");
    const exception = new HttpException({ error: { code: "OUT_OF_STOCK", message: "Sem estoque." } }, HttpStatus.CONFLICT);

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(json).toHaveBeenCalledWith({ error: { code: "OUT_OF_STOCK", message: "Sem estoque." } });
  });

  it("turns an unexpected, non-HttpException error into a generic 500", () => {
    const filter = new HttpExceptionFilter();
    const { host, status, json } = fakeHost("req-1");

    filter.catch(new Error("something nobody expected"), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      error: { code: "INTERNAL_ERROR", message: "Ocorreu um erro inesperado. Tente novamente." },
    });
  });

  it("still logs a well-formed line when the request carries no requestId", () => {
    const filter = new HttpExceptionFilter();
    const { host, status, json } = fakeHost(undefined);
    const exception = new HttpException({ error: { code: "OUT_OF_STOCK", message: "Sem estoque." } }, HttpStatus.CONFLICT);

    expect(() => filter.catch(exception, host)).not.toThrow();

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(json).toHaveBeenCalledWith({ error: { code: "OUT_OF_STOCK", message: "Sem estoque." } });
  });

  it("falls back to the exception's own message when the body has no error.code/message (a plain Nest HttpException, not one of our typed ones)", () => {
    const filter = new HttpExceptionFilter();
    const { host, status, json } = fakeHost("req-1");
    const exception = new HttpException("Forbidden", HttpStatus.FORBIDDEN);

    expect(() => filter.catch(exception, host)).not.toThrow();

    expect(status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(json).toHaveBeenCalledWith("Forbidden");
  });

  it("stringifies a thrown non-Error value instead of reading a stack that doesn't exist", () => {
    const filter = new HttpExceptionFilter();
    const { host, status } = fakeHost("req-1");

    expect(() => filter.catch("a string was thrown, not an Error", host)).not.toThrow();

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
  });
});
