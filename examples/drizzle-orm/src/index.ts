import { drizzle } from "drizzle-orm/d1";
import { eq, desc } from "drizzle-orm";
import * as schema from "./db/schema";
import { worker } from "../bw.config";
import type { InferEnv } from "better-wrangler";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

type Env = InferEnv<typeof worker.bindings>;

// Infer types from Drizzle schema
type Task = InferSelectModel<typeof schema.tasks>;
type NewTask = InferInsertModel<typeof schema.tasks>;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Initialize Drizzle with D1 binding
    const db = drizzle(env.DB, { schema });

    // CORS headers for dev UI
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle preflight
    if (method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // GET /tasks - List all tasks
      if (path === "/tasks" && method === "GET") {
        const results = await db
          .select()
          .from(schema.tasks)
          .orderBy(desc(schema.tasks.createdAt));

        return Response.json(results, { headers: corsHeaders });
      }

      // GET /tasks/:id - Get a single task
      const taskMatch = path.match(/^\/tasks\/(\d+)$/);
      if (taskMatch && method === "GET") {
        const id = parseInt(taskMatch[1]);
        const [task] = await db
          .select()
          .from(schema.tasks)
          .where(eq(schema.tasks.id, id));

        if (!task) {
          return Response.json(
            { error: "Task not found" },
            { status: 404, headers: corsHeaders }
          );
        }

        return Response.json(task, { headers: corsHeaders });
      }

      // POST /tasks - Create a new task
      if (path === "/tasks" && method === "POST") {
        const body = await request.json<{ title: string }>();

        if (!body.title) {
          return Response.json(
            { error: "Title is required" },
            { status: 400, headers: corsHeaders }
          );
        }

        const [result] = await db
          .insert(schema.tasks)
          .values({ title: body.title })
          .returning();

        return Response.json(result, { status: 201, headers: corsHeaders });
      }

      // PUT /tasks/:id - Update a task
      if (taskMatch && method === "PUT") {
        const id = parseInt(taskMatch[1]);
        const body = await request.json<{ title?: string; completed?: boolean }>();

        // Check if task exists
        const [existing] = await db
          .select()
          .from(schema.tasks)
          .where(eq(schema.tasks.id, id));

        if (!existing) {
          return Response.json(
            { error: "Task not found" },
            { status: 404, headers: corsHeaders }
          );
        }

        // Build update object
        const updates: Partial<NewTask> = {};
        if (body.title !== undefined) {
          updates.title = body.title;
        }
        if (body.completed !== undefined) {
          updates.completed = body.completed;
        }

        if (Object.keys(updates).length === 0) {
          return Response.json(existing, { headers: corsHeaders });
        }

        const [result] = await db
          .update(schema.tasks)
          .set(updates)
          .where(eq(schema.tasks.id, id))
          .returning();

        return Response.json(result, { headers: corsHeaders });
      }

      // DELETE /tasks/:id - Delete a task
      if (taskMatch && method === "DELETE") {
        const id = parseInt(taskMatch[1]);

        const [existing] = await db
          .select()
          .from(schema.tasks)
          .where(eq(schema.tasks.id, id));

        if (!existing) {
          return Response.json(
            { error: "Task not found" },
            { status: 404, headers: corsHeaders }
          );
        }

        await db.delete(schema.tasks).where(eq(schema.tasks.id, id));

        return Response.json(
          { message: "Task deleted", task: existing },
          { headers: corsHeaders }
        );
      }

      // Root path - API info
      if (path === "/" || path === "") {
        return Response.json(
          {
            name: "Drizzle ORM Example",
            description: "D1 database with Drizzle ORM for type-safe queries",
            endpoints: [
              { method: "GET", path: "/tasks", description: "List all tasks" },
              { method: "GET", path: "/tasks/:id", description: "Get a task by ID" },
              { method: "POST", path: "/tasks", description: "Create a new task", body: { title: "string" } },
              { method: "PUT", path: "/tasks/:id", description: "Update a task", body: { title: "string?", completed: "boolean?" } },
              { method: "DELETE", path: "/tasks/:id", description: "Delete a task" },
            ],
          },
          { headers: corsHeaders }
        );
      }

      return Response.json(
        { error: "Not found" },
        { status: 404, headers: corsHeaders }
      );
    } catch (error) {
      console.error("Error:", error);
      return Response.json(
        { error: error instanceof Error ? error.message : "Internal server error" },
        { status: 500, headers: corsHeaders }
      );
    }
  },
};
