import { ArgumentsHost, HttpException, HttpStatus } from "@nestjs/common";
import { HttpExceptionFilter } from "./http-exception.filter";

function fakeHost(): { host: ArgumentsHost; status: jest.Mock; json: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ id: "req-1", method: "GET", originalUrl: "/whatever" }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe("HttpExceptionFilter", () => {
  it("passes an HttpException's own status and body straight through", () => {
    const filter = new HttpExceptionFilter();
    const { host, status, json } = fakeHost();
    const exception = new HttpException({ error: { code: "OUT_OF_STOCK", message: "Sem estoque." } }, HttpStatus.CONFLICT);

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(json).toHaveBeenCalledWith({ error: { code: "OUT_OF_STOCK", message: "Sem estoque." } });
  });

  // The one path nothing else in the app ever exercises: an exception that
  // isn't one of our typed HttpExceptions (a real bug, not a business-rule
  // rejection) still has to produce a well-formed 500, never crash the
  // process or leak a stack trace to the client.
  it("turns an unexpected, non-HttpException error into a generic 500", () => {
    const filter = new HttpExceptionFilter();
    const { host, status, json } = fakeHost();

    filter.catch(new Error("something nobody expected"), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      error: { code: "INTERNAL_ERROR", message: "Ocorreu um erro inesperado. Tente novamente." },
    });
  });
});
