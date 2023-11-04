import type { FastifyInstance } from "../server";
import * as itemControl from "../controllers/item";
import * as statsControl from "../controllers/statistics";
import APIError from "../api_error";

export default async function (fastify: FastifyInstance) {
  fastify.get(
    "/",
    {
      schema: {
        summary: "Get menu from current restaurant",
        tags: ["restaurant", "item"],
        response: {
          200: {
            type: "array",
            description: "List of items in the menu",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                id: { type: "string", minLength: 16, maxLength: 16 },
                name: { type: "string", minLength: 3, maxLength: 255 },
                price: { type: "number", minimum: 0 }
              },
              required: ["id", "name", "price"]
            }
          }
        }
      } as const
    },
    async (request, reply) => {
      await fastify.authenticateWithRestaurant(request, reply);
      const menu = await itemControl.getAllFrom(request.user.restaurant!.id);

      return reply.send(menu);
    }
  );

  fastify.get(
    "/:id",
    {
      schema: {
        params: {
          type: "object",
          properties: {
            id: {
              type: "string",
              minLength: 16,
              maxLength: 16,
              description: "Public ID of the item"
            }
          },
          required: ["id"]
        },
        response: {
          200: {
            type: "object",
            properties: {
              id: { type: "string", minLength: 16, maxLength: 16 },
              name: { type: "string", minLength: 3, maxLength: 255 },
              price: { type: "number", minimum: 0 },
              description: { type: "string", maxLength: 255 }
            },
            required: ["id", "name", "price"]
          }
        }
      } as const
    },
    async (request, reply) => {
      await fastify.authenticateWithRestaurant(request, reply);

      const itemId = request.params.id;
      const item = await itemControl.get(itemId);

      if (item.restaurantId !== request.user.restaurant!.id) {
        throw new APIError("You don't have access to this item", 403);
      }

      return reply.send(item);
    }
  );

  fastify.post(
    "/",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            name: {
              type: "string",
              minLength: 3,
              maxLength: 255,
              description: "Name of item"
            },
            price: {
              type: "integer",
              minimum: 0,
              default: 0,
              description: "Price in cents"
            },
            description: {
              type: "string",
              maxLength: 255,
              description: "Optional description of item"
            }
          },
          required: ["name", "price"],
          additionalProperties: false
        }
      } as const
    },
    async (request, reply) => {
      await fastify.authenticateWithRestaurant(request, reply);

      const itemId = await itemControl.create({
        name: request.body.name,
        price: request.body.price,
        description: request.body.description,
        restaurantId: request.user.restaurant!.id
      });

      return reply.send(await itemControl.get(itemId));
    }
  );

  fastify.delete(
    "/:id",
    {
      schema: {
        params: {
          type: "object",
          properties: {
            id: {
              type: "string",
              minLength: 16,
              maxLength: 16,
              description: "Public ID of the item"
            }
          },
          required: ["id"]
        }
      } as const
    },
    async (request, reply) => {
      await fastify.authenticateWithRestaurant(request, reply);

      const itemId = request.params.id;
      const item = await itemControl.get(itemId);

      if (item.restaurantId !== request.user.restaurant!.id) {
        throw new APIError("You don't have access to this item", 403);
      }

      await itemControl.del(itemId);

      return reply.send("Item deleted successfully");
    }
  );

  fastify.get(
    "/best-seller",
    {
      schema: {
        summary: "Get most sold products",
        tags: ["info"]
      } as const
    },
    async (request, reply) => {
      await fastify.authenticateWithRestaurant(request, reply);

      return reply.send(
        await statsControl.mostSold(request.user!.restaurant!.id)
      );
    }
  );

  fastify.get(
    "/worst-seller",
    {
      schema: {
        summary: "Get least sold product",
        tags: ["info"]
      } as const
    },
    async (request, reply) => {
      await fastify.authenticateWithRestaurant(request, reply);

      return reply.send(
        await statsControl.leastSold(request.user!.restaurant!.id)
      );
    }
  );
}
