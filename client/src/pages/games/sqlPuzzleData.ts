// Seeded SQL Puzzle bank. Each puzzle sets up a tiny in-memory schema,
// seeds a few rows, and asks the user to write a query whose result set
// matches `expectedResult`. Order-insensitive comparison by default —
// puzzles that require ordering set `mustBeOrdered: true`.
//
// Keep schemas & seed data intentionally tiny (5-8 rows) so the whole thing
// fits in the head and users can mentally verify their answer.

export interface SqlPuzzle {
  id: string;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  subject: string;                       // "SQL basics" | "Joins" | "Aggregation" | ...
  prompt: string;                        // plain-English question
  schemaSql: string;                     // CREATE TABLE + INSERT statements
  expectedResult: {                      // matches sql.js exec() shape
    columns: string[];
    values: any[][];
  };
  mustBeOrdered?: boolean;
  hint: string;
  solution: string;                      // shown after check (or on give-up)
}

export const SQL_PUZZLES: SqlPuzzle[] = [
  {
    id: 'select-basics',
    title: 'All employees earning over 50k',
    difficulty: 'easy',
    subject: 'SELECT basics',
    prompt: 'Return the name and salary of every employee earning STRICTLY MORE than 50000. Any order.',
    schemaSql: `
CREATE TABLE employees (id INTEGER, name TEXT, dept TEXT, salary INTEGER);
INSERT INTO employees VALUES
  (1, 'Alice',   'Engineering', 72000),
  (2, 'Bob',     'Sales',       48000),
  (3, 'Charlie', 'Engineering', 55000),
  (4, 'Diana',   'HR',          50000),
  (5, 'Eve',     'Marketing',   61000);
`,
    expectedResult: {
      columns: ['name', 'salary'],
      values: [
        ['Alice',   72000],
        ['Charlie', 55000],
        ['Eve',     61000],
      ],
    },
    hint: 'Filter with WHERE salary > 50000. Select only the two columns.',
    solution: 'SELECT name, salary FROM employees WHERE salary > 50000;',
  },
  {
    id: 'count-by-dept',
    title: 'Employees per department',
    difficulty: 'easy',
    subject: 'GROUP BY',
    prompt: 'Return each department and the number of employees in it. Column names: dept, headcount.',
    schemaSql: `
CREATE TABLE employees (id INTEGER, name TEXT, dept TEXT, salary INTEGER);
INSERT INTO employees VALUES
  (1, 'Alice',   'Engineering', 72000),
  (2, 'Bob',     'Sales',       48000),
  (3, 'Charlie', 'Engineering', 55000),
  (4, 'Diana',   'HR',          50000),
  (5, 'Eve',     'Sales',       61000),
  (6, 'Frank',   'Engineering', 90000);
`,
    expectedResult: {
      columns: ['dept', 'headcount'],
      values: [
        ['Engineering', 3],
        ['HR', 1],
        ['Sales', 2],
      ],
    },
    hint: 'GROUP BY dept + COUNT(*). Alias the count with AS headcount.',
    solution: 'SELECT dept, COUNT(*) AS headcount FROM employees GROUP BY dept;',
  },
  {
    id: 'avg-salary',
    title: 'Departments where the average salary exceeds 60000',
    difficulty: 'medium',
    subject: 'HAVING',
    prompt: 'Return departments whose AVERAGE salary is strictly greater than 60000. Columns: dept, avg_salary. Round avg_salary to integer.',
    schemaSql: `
CREATE TABLE employees (id INTEGER, name TEXT, dept TEXT, salary INTEGER);
INSERT INTO employees VALUES
  (1, 'Alice',   'Engineering', 72000),
  (2, 'Bob',     'Sales',       48000),
  (3, 'Charlie', 'Engineering', 55000),
  (4, 'Diana',   'HR',          50000),
  (5, 'Eve',     'Sales',       61000),
  (6, 'Frank',   'Engineering', 90000),
  (7, 'Gina',    'HR',          72000);
`,
    expectedResult: {
      // Eng avg = 72333.33 → 72333; HR avg = 61000; Sales avg = 54500
      columns: ['dept', 'avg_salary'],
      values: [
        ['Engineering', 72333],
        ['HR', 61000],
      ],
    },
    hint: 'GROUP BY dept, HAVING AVG(salary) > 60000, wrap AVG in CAST(... AS INTEGER) or ROUND.',
    solution: `SELECT dept, CAST(AVG(salary) AS INTEGER) AS avg_salary
FROM employees GROUP BY dept HAVING AVG(salary) > 60000;`,
  },
  {
    id: 'join-basic',
    title: 'Order value with customer names',
    difficulty: 'medium',
    subject: 'JOIN',
    prompt: 'For every order, return the customer NAME and the order AMOUNT. Column names: name, amount.',
    schemaSql: `
CREATE TABLE customers (id INTEGER, name TEXT);
CREATE TABLE orders (id INTEGER, customer_id INTEGER, amount INTEGER);
INSERT INTO customers VALUES
  (1, 'Ram'), (2, 'Sita'), (3, 'Krishna');
INSERT INTO orders VALUES
  (101, 1, 250),
  (102, 1, 480),
  (103, 2, 150),
  (104, 3, 990);
`,
    expectedResult: {
      columns: ['name', 'amount'],
      values: [
        ['Ram', 250],
        ['Ram', 480],
        ['Sita', 150],
        ['Krishna', 990],
      ],
    },
    hint: 'INNER JOIN customers c ON c.id = o.customer_id.',
    solution: `SELECT c.name, o.amount
FROM customers c JOIN orders o ON o.customer_id = c.id;`,
  },
  {
    id: 'top-earners',
    title: 'Top 3 highest-paid employees, tie-break by name',
    difficulty: 'medium',
    subject: 'ORDER BY + LIMIT',
    prompt: 'Return the top 3 highest-paid employees. If salaries tie, order alphabetically by name. Columns: name, salary. ORDER MATTERS.',
    schemaSql: `
CREATE TABLE employees (id INTEGER, name TEXT, salary INTEGER);
INSERT INTO employees VALUES
  (1, 'Alice',   72000),
  (2, 'Bob',     72000),
  (3, 'Charlie', 55000),
  (4, 'Diana',   90000),
  (5, 'Eve',     61000);
`,
    expectedResult: {
      columns: ['name', 'salary'],
      values: [
        ['Diana', 90000],
        ['Alice', 72000],
        ['Bob',   72000],
      ],
    },
    mustBeOrdered: true,
    hint: 'ORDER BY salary DESC, name ASC LIMIT 3.',
    solution: `SELECT name, salary FROM employees ORDER BY salary DESC, name ASC LIMIT 3;`,
  },
  {
    id: 'left-join-null',
    title: 'Customers who have never ordered',
    difficulty: 'medium',
    subject: 'LEFT JOIN + NULL',
    prompt: 'Return the names of customers who have zero orders. Column name: name.',
    schemaSql: `
CREATE TABLE customers (id INTEGER, name TEXT);
CREATE TABLE orders (id INTEGER, customer_id INTEGER);
INSERT INTO customers VALUES
  (1, 'Ram'), (2, 'Sita'), (3, 'Krishna'), (4, 'Meera');
INSERT INTO orders VALUES
  (101, 1),
  (102, 3);
`,
    expectedResult: {
      columns: ['name'],
      values: [
        ['Sita'],
        ['Meera'],
      ],
    },
    hint: 'LEFT JOIN then filter WHERE orders.id IS NULL.',
    solution: `SELECT c.name FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.id IS NULL;`,
  },
  {
    id: 'second-highest',
    title: 'Second-highest salary (distinct)',
    difficulty: 'hard',
    subject: 'DISTINCT + subquery',
    prompt: 'Return the SECOND-HIGHEST DISTINCT salary in the table. Column: salary.',
    schemaSql: `
CREATE TABLE employees (id INTEGER, name TEXT, salary INTEGER);
INSERT INTO employees VALUES
  (1, 'Alice',   90000),
  (2, 'Bob',     90000),
  (3, 'Charlie', 72000),
  (4, 'Diana',   72000),
  (5, 'Eve',     61000);
`,
    expectedResult: { columns: ['salary'], values: [[72000]] },
    hint: 'MAX(salary) WHERE salary < (SELECT MAX(salary) FROM employees). Or ORDER BY DESC LIMIT 1 OFFSET 1 with DISTINCT.',
    solution: `SELECT MAX(salary) AS salary FROM employees
WHERE salary < (SELECT MAX(salary) FROM employees);`,
  },
  {
    id: 'orders-per-customer',
    title: 'Customers with 2+ orders and their total spend',
    difficulty: 'hard',
    subject: 'GROUP BY + HAVING + JOIN',
    prompt: 'Return the name of every customer with 2 or more orders, plus their total spend. Columns: name, total_spend. Any order.',
    schemaSql: `
CREATE TABLE customers (id INTEGER, name TEXT);
CREATE TABLE orders (id INTEGER, customer_id INTEGER, amount INTEGER);
INSERT INTO customers VALUES
  (1, 'Ram'), (2, 'Sita'), (3, 'Krishna'), (4, 'Meera');
INSERT INTO orders VALUES
  (101, 1, 250),
  (102, 1, 480),
  (103, 2, 150),
  (104, 3, 990),
  (105, 3, 400),
  (106, 3, 100);
`,
    expectedResult: {
      columns: ['name', 'total_spend'],
      values: [
        ['Ram', 730],
        ['Krishna', 1490],
      ],
    },
    hint: 'JOIN, GROUP BY c.name, HAVING COUNT(o.id) >= 2.',
    solution: `SELECT c.name, SUM(o.amount) AS total_spend
FROM customers c JOIN orders o ON o.customer_id = c.id
GROUP BY c.name HAVING COUNT(o.id) >= 2;`,
  },
];
