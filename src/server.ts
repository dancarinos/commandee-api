import Fastify, {
  FastifyError,
  FastifyReply,
  FastifyRequest,
  FastifyTypeProvider
} from "fastify";
import path from "path";
import { fileURLToPath } from "url";
import { Static, TSchema } from "@fastify/type-provider-typebox";
import type {
  FromSchema,
  FromSchemaOptions,
  FromSchemaDefaultOptions,
  JSONSchema7
} from "json-schema-to-ts";
import YAML from "js-yaml";
import fs from "fs/promises";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface TypeProvider<
  Options extends FromSchemaOptions = FromSchemaDefaultOptions
> extends FastifyTypeProvider {
  output: this["input"] extends TSchema
    ? Static<this["input"]>
    : this["input"] extends JSONSchema7
    ? FromSchema<this["input"], Options>
    : never;
}

const fastify = Fastify({
  ajv: {
    customOptions: {
      keywords: ["media"]
    },
    plugins: [(await import("@fastify/multipart")).ajvFilePlugin]
  }
}).withTypeProvider<TypeProvider>();

fastify.register(import("@fastify/accepts"));

fastify.register(import("@fastify/static"), {
  root: import.meta.env.PROD ? __dirname : path.join(__dirname, ".."),
  wildcard: false,
  serve: false
});

fastify.register(import("@fastify/static"), {
  root: path.join(__dirname, import.meta.env.PROD ? "./public" : "../public"),
  wildcard: true,
  decorateReply: false
});

fastify.register(import("@fastify/cookie"), {
  secret: enviroment.COOKIE_SECRET
});

fastify.register(import("@fastify/jwt"), {
  secret: enviroment.JWT_SECRET,
  cookie: {
    cookieName: "token",
    signed: false
  },
  sign: {
    expiresIn: "30s"
  },
  formatUser: (user) => () => userControl.get(user.id)
});

fastify.decorate(
  "authenticate",
  async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      const error = err as FastifyError;

      switch (error.code) {
        case "FST_JWT_AUTHORIZATION_TOKEN_EXPIRED":
          return reply.code(403).send(error);

        default:
          return reply.code(401).send(error);
      }
    }
  }
);

fastify.register(import("@fastify/formbody"));
fastify.register(import("@fastify/multipart"), { addToBody: true });
fastify.addContentTypeParser(
  ["application/yaml", "application/yml", "text/yaml", "text/yml"],
  { parseAs: "string" },
  (_, body, done) => {
    try {
      done(null, YAML.load(body as string));
    } catch (err: any) {
      err.statusCode = 400;
      done(err, undefined);
    }
  }
);

declare module "fastify" {
  interface FastifyReply {
    view: (element: JSX.Element) => FastifyReply;
  }

  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
  }
}

fastify.decorateReply("view", function (element: JSX.Element) {
  (this as unknown as FastifyReply).type("text/html");
  return this.send(element);
});

fastify.register(import("@fastify/swagger"), {
  openapi: {
    info: {
      title: "Fastify API",
      description: "Testing the Fastify openapi API",
      version: "0.1.0"
    },
    externalDocs: {
      url: "https://swagger.io",
      description: "Find more info here"
    },
    servers: [
      {
        url: "http://localhost:3000",
        description: "Local server"
      }
    ]
  },
  prefix: "/documentation",
  transform: ({ schema, url }: { schema: any; url: string }) => {
    if (schema) {
      schema.consumes ??= [
        "application/json",
        "multipart/form-data",
        "text/yaml",
        "text/yml",
        "application/yaml",
        "application/yml",
        "application/x-www-form-urlencoded"
      ];

      schema.produces ??= ["application/json"];
    }

    return { schema, url };
  }
});

if (import.meta.env.DEV) {
  fastify.register(import("@fastify/swagger-ui"));
}

fastify.register(async (fastify: FastifyInstance) => {
  fastify.get(
    "/openapi",
    {
      schema: {
        summary: "OpenAPI Docs",
        description: "OpenAPI documentation for the API",
        tags: ["documentation"],
        produces: ["application/json", "text/yaml"],
        consumes: [
          "application/json",
          "text/yaml",
          "application/yaml",
          "text/yml"
        ]
      } as const
    },
    (request, reply) => {
      const validType =
        request.type([
          "application/json",
          "application/yaml",
          "text/yaml",
          "text/yml"
        ]) || "application/json";
      const type = Array.isArray(validType) ? validType[0] : validType;

      if (type === "application/json") {
        if (import.meta.env.PROD) {
          return reply.sendFile("/public/openapi.json");
        } else {
          return reply.type("application/json").send(openAPIJson);
        }
      } else {
        if (import.meta.env.PROD) {
          return reply.sendFile("/public/openapi.yaml");
        } else {
          return reply.type("text/yaml").send(openAPIYaml);
        }
      }
    }
  );

  fastify.get(
    "/openapi/json",
    {
      schema: {
        summary: "OpenAPI Docs JSON",
        hide: true,
        description: "OpenAPI documentation for the API in JSON format",
        consumes: ["application/json"],
        produces: ["application/json"],
        tags: ["documentation"]
      }
    },
    (_, reply) => {
      if (import.meta.env.PROD) {
        return reply.sendFile("/public/openapi.json");
      } else {
        return reply.type("application/json").send(openAPIJson);
      }
    }
  );

  fastify.get(
    "/openapi/yaml",
    {
      schema: {
        summary: "OpenAPI Docs YAML",
        hide: true,
        description: "OpenAPI documentation for the API in YAML format",
        consumes: ["application/yaml", "text/yaml", "text/yml"],
        produces: ["text/yaml"],
        tags: ["documentation"]
      }
    },
    (_, reply) => {
      if (import.meta.env.PROD) {
        return reply.sendFile("/public/openapi.yaml");
      } else {
        return reply.type("text/yaml").send(openAPIYaml);
      }
    }
  );

  if (import.meta.env.DEV) {
    fastify.get("/openapi.json", { schema: { hide: true } }, (_, reply) => {
      return reply.type("application/json").send(openAPIJson);
    });

    fastify.get("/openapi.yaml", { schema: { hide: true } }, (_, reply) => {
      return reply.type("text/yaml").send(openAPIYaml);
    });
  }
});

fastify.register(import("./router"));

await fastify.ready();

if (import.meta.env.PROD) {
  fs.writeFile(
    path.join(__dirname, "public/openapi.json"),
    JSON.stringify(fastify.swagger()),
    {
      encoding: "utf8"
    }
  );

  fs.writeFile(
    path.join(__dirname, "public/openapi.yaml"),
    fastify.swagger({ yaml: true }),
    {
      encoding: "utf8"
    }
  );

  const { PORT, HOST } = await import("./enviroment");

  fastify.listen({ port: PORT, host: HOST }, (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }

    console.log(`Server listening at ${address}`);
  });
} else {
  var openAPIJson = JSON.stringify(fastify.swagger());
  var openAPIYaml = fastify.swagger({ yaml: true });
}

export type FastifyInstance = typeof fastify;
export const viteNodeApp = fastify;
