import * as fs from "fs-extra";
import * as glob from "glob";
import * as path from "path";
import { inject, injectable } from "inversify";
import { HttpHeaders, HttpStatusCode } from "../middleware/http";
import { Mock } from "../mock/mock";
import { ProcessingOptions } from "./processing.options";
import { State } from "../state/state";

/** Mocks processor. */
@injectable()
export class MocksProcessor {
  private DEFAULT_DELAY = 0;
  private DEFAULT_ECHO = false;
  private PASS_THROUGH = "passThrough";

  /**
   * Constructor.
   * @param {State} state The state.
   */
  constructor(@inject("State") public state: State) {}

  /**
   * Initialize apimock by:
   * - processing the globs and processing all available mocks.
   * @param {ProcessingOptions} options The processing options.
   */
  process(options: ProcessingOptions): void {
    let counter = 0;
    const pattern = options.patterns.mocks;

    glob
      .sync(pattern.substring(0, pattern.length - 2), {
        cwd: options.src,
        root: "/"
      })
      .forEach(file => {
        console.log("Processing: ", file);
        let requireFilePath = path.relative(
          path.resolve(__dirname),
          path.resolve(path.join(options.src, file))
        );
        delete require.cache[require.resolve(requireFilePath)];
        let mock = require(requireFilePath);

        if (mock.default) {
          mock = mock.default;
          const mockPath = path.join(options.src, file);
          const match = this.state.mocks.find(
            _mock => _mock.name === mock.name
          );
          const index = this.state.mocks.indexOf(match);
          mock.path = path.dirname(mockPath);
          if (index > -1) {
            console.warn(
              `Mock with identifier '${mock.name}' already exists. Overwriting existing mock.`
            );
            this.state.mocks[index] = mock;
          } else {
            this.state.mocks.push(mock);
            counter++;
          }
          Object.keys(mock.responses).forEach(key => {
            const response = mock.responses[key];
            if (response.status === undefined) {
              response.status = HttpStatusCode.OK;
            }
            if (response.data === undefined) {
              response.data = mock.isArray ? [] : {};
            }
            if (response.headers === undefined) {
              response.headers =
                response.file !== undefined
                  ? HttpHeaders.CONTENT_TYPE_BINARY
                  : HttpHeaders.CONTENT_TYPE_APPLICATION_JSON;
            }
            return response;
          });
          const _default = Object.keys(mock.responses).find(
            key => !!mock.responses[key]["default"]
          );
          let state = {
            scenario: this.PASS_THROUGH,
            echo: this.DEFAULT_ECHO,
            delay: mock.delay || this.DEFAULT_DELAY
          };
          if (_default !== undefined) {
            state = {
              scenario: _default,
              echo: this.DEFAULT_ECHO,
              delay: mock.delay || this.DEFAULT_DELAY
            };
          }
          this.state.defaults[mock.name] = state;
          this.state.global.mocks[mock.name] = JSON.parse(
            JSON.stringify(state)
          );
        }
      });

    glob
      .sync(pattern, {
        cwd: options.src,
        root: "/"
      })
      .forEach(file => {
        const mockPath = path.join(options.src, file);
        const mock = fs.readJsonSync(mockPath);
        const match = this.state.mocks.find(
          (_mock: Mock) => _mock.name === mock.name
        );
        const index = this.state.mocks.indexOf(match);

        mock.path = path.dirname(mockPath);

        if (index > -1) {
          // exists so update mock
          console.warn(
            `Mock with identifier '${mock.name}' already exists. Overwriting existing mock.`
          );
          this.state.mocks[index] = mock;
        } else {
          // add mock
          this.state.mocks.push(mock);
          counter++;
        }

        Object.keys(mock.responses).forEach(key => {
          const response = mock.responses[key];
          if (response.status === undefined) {
            response.status = HttpStatusCode.OK;
          }
          if (response.data === undefined) {
            response.data = mock.isArray ? [] : {};
          }
          if (response.headers === undefined) {
            response.headers =
              response.file !== undefined
                ? HttpHeaders.CONTENT_TYPE_BINARY
                : HttpHeaders.CONTENT_TYPE_APPLICATION_JSON;
          }
          return response;
        });

        const _default = Object.keys(mock.responses).find(
          key => !!mock.responses[key]["default"]
        );
        let state = {
          scenario: this.PASS_THROUGH,
          echo: this.DEFAULT_ECHO,
          delay: mock.delay || this.DEFAULT_DELAY
        };

        if (_default !== undefined) {
          state = {
            scenario: _default,
            echo: this.DEFAULT_ECHO,
            delay: mock.delay || this.DEFAULT_DELAY
          };
        }

        this.state.defaults[mock.name] = state;
        this.state.global.mocks[mock.name] = JSON.parse(JSON.stringify(state));
      });

    console.log(`Processed ${counter} unique mocks.`);
  }
}
