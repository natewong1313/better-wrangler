-- Create tasks table
CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  completed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Insert some sample data
INSERT INTO tasks (title, completed) VALUES ('Learn D1', 0);
INSERT INTO tasks (title, completed) VALUES ('Build a Worker', 1);
INSERT INTO tasks (title, completed) VALUES ('Test the API', 0);
