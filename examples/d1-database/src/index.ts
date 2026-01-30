import { worker } from "../bw.config";
import type { InferEnv } from "better-wrangler";

type Env = InferEnv<typeof worker.bindings>;

interface Task {
  id: number;
  title: string;
  completed: number;
  created_at: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

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
        const { results } = await env.DB.prepare(
          "SELECT * FROM tasks ORDER BY created_at DESC"
        ).all<Task>();

        return Response.json(results, { headers: corsHeaders });
      }

      // GET /tasks/:id - Get a single task
      const taskMatch = path.match(/^\/tasks\/(\d+)$/);
      if (taskMatch && method === "GET") {
        const id = parseInt(taskMatch[1]);
        const task = await env.DB.prepare(
          "SELECT * FROM tasks WHERE id = ?"
        )
          .bind(id)
          .first<Task>();

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

        const result = await env.DB.prepare(
          "INSERT INTO tasks (title) VALUES (?) RETURNING *"
        )
          .bind(body.title)
          .first<Task>();

        return Response.json(result, { status: 201, headers: corsHeaders });
      }

      // PUT /tasks/:id - Update a task
      if (taskMatch && method === "PUT") {
        const id = parseInt(taskMatch[1]);
        const body = await request.json<{ title?: string; completed?: boolean }>();

        // Check if task exists
        const existing = await env.DB.prepare(
          "SELECT * FROM tasks WHERE id = ?"
        )
          .bind(id)
          .first<Task>();

        if (!existing) {
          return Response.json(
            { error: "Task not found" },
            { status: 404, headers: corsHeaders }
          );
        }

        // Build update query
        const updates: string[] = [];
        const values: (string | number)[] = [];

        if (body.title !== undefined) {
          updates.push("title = ?");
          values.push(body.title);
        }
        if (body.completed !== undefined) {
          updates.push("completed = ?");
          values.push(body.completed ? 1 : 0);
        }

        if (updates.length === 0) {
          return Response.json(existing, { headers: corsHeaders });
        }

        values.push(id);
        const result = await env.DB.prepare(
          `UPDATE tasks SET ${updates.join(", ")} WHERE id = ? RETURNING *`
        )
          .bind(...values)
          .first<Task>();

        return Response.json(result, { headers: corsHeaders });
      }

      // DELETE /tasks/:id - Delete a task
      if (taskMatch && method === "DELETE") {
        const id = parseInt(taskMatch[1]);

        const existing = await env.DB.prepare(
          "SELECT * FROM tasks WHERE id = ?"
        )
          .bind(id)
          .first<Task>();

        if (!existing) {
          return Response.json(
            { error: "Task not found" },
            { status: 404, headers: corsHeaders }
          );
        }

        await env.DB.prepare("DELETE FROM tasks WHERE id = ?").bind(id).run();

        return Response.json(
          { message: "Task deleted", task: existing },
          { headers: corsHeaders }
        );
      }

      // Root path - API info
      if (path === "/" || path === "") {
        return Response.json(
          {
            name: "D1 Database Example",
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
