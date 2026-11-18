-- Sample databases for the SQL Lab. Seeded into an in-memory DuckDB on startup / reset.
-- Domains: e-commerce, banking, HR, plus event logs and a staging/warehouse area.

CREATE TABLE customers (
  customer_id INTEGER PRIMARY KEY, name VARCHAR, email VARCHAR, country VARCHAR,
  signup_date DATE, segment VARCHAR
);
INSERT INTO customers VALUES
 (1,'Alice Johnson','alice@example.com','US','2023-01-15','Premium'),
 (2,'Bob Smith','bob@example.com','UK','2023-02-20','Standard'),
 (3,'Chandra Rao','chandra@example.com','IN','2023-03-05','Premium'),
 (4,'Diana Lopez','diana@example.com','ES','2023-03-18','Standard'),
 (5,'Ethan Brown','ethan@example.com','US','2023-04-02','Standard'),
 (6,'Fatima Khan','fatima@example.com','AE','2023-05-11','Premium'),
 (7,'George Müller','george@example.com','DE','2023-06-21','Standard'),
 (8,'Hana Sato','hana@example.com','JP','2023-07-09','Standard'),
 (9,'Ivan Petrov','ivan@example.com','US',NULL,'Standard'),
 (10,'Julia Chen','julia@example.com','SG','2023-09-30','Premium');

CREATE TABLE products (
  product_id INTEGER PRIMARY KEY, product_name VARCHAR, category VARCHAR, unit_price DECIMAL(10,2)
);
INSERT INTO products VALUES
 (1,'Laptop Pro 14','Electronics',1200.00),
 (2,'Wireless Mouse','Electronics',25.00),
 (3,'Mechanical Keyboard','Electronics',95.00),
 (4,'Standing Desk','Furniture',450.00),
 (5,'Ergonomic Chair','Furniture',320.00),
 (6,'Notebook Pack','Stationery',12.50),
 (7,'Gel Pen Set','Stationery',8.00),
 (8,'Noise-Cancelling Headphones','Electronics',210.00);

CREATE TABLE orders (
  order_id INTEGER PRIMARY KEY, customer_id INTEGER, order_date DATE, status VARCHAR
);
INSERT INTO orders VALUES
 (101,1,'2024-01-05','completed'),(102,2,'2024-01-07','completed'),
 (103,1,'2024-01-20','completed'),(104,3,'2024-02-02','completed'),
 (105,4,'2024-02-14','cancelled'),(106,5,'2024-02-20','completed'),
 (107,1,'2024-03-01','completed'),(108,6,'2024-03-05','completed'),
 (109,3,'2024-03-15','completed'),(110,2,'2024-03-28','returned'),
 (111,7,'2024-04-02','completed'),(112,1,'2024-04-18','completed'),
 (113,8,'2024-04-25','completed'),(114,3,'2024-05-03','completed'),
 (115,6,'2024-05-19','completed'),(116,5,'2024-06-01','completed');

CREATE TABLE order_items (
  order_id INTEGER, product_id INTEGER, quantity INTEGER, discount DECIMAL(4,2)
);
INSERT INTO order_items VALUES
 (101,1,1,0),(101,2,2,0),(102,6,5,0.10),(103,3,1,0),(103,8,1,0.05),
 (104,4,1,0),(104,5,1,0.10),(105,2,1,0),(106,7,10,0),(106,6,3,0),
 (107,1,1,0.05),(108,8,2,0),(109,3,1,0),(109,2,1,0),(110,6,2,0),
 (111,5,2,0),(112,1,1,0),(112,3,1,0.10),(113,7,4,0),(114,4,1,0.05),
 (115,8,1,0),(115,2,3,0),(116,6,10,0.15);

CREATE TABLE employees (
  emp_id INTEGER PRIMARY KEY, emp_name VARCHAR, department VARCHAR, manager_id INTEGER,
  salary INTEGER, hire_date DATE
);
INSERT INTO employees VALUES
 (1,'Priya Nair','Engineering',NULL,185000,'2018-03-01'),
 (2,'Marcus Lee','Engineering',1,140000,'2019-06-15'),
 (3,'Sofia Alvarez','Engineering',1,140000,'2020-01-10'),
 (4,'Tom Becker','Engineering',2,110000,'2021-09-01'),
 (5,'Aisha Bello','Engineering',2,98000,'2022-04-12'),
 (6,'Liam O''Connor','Sales',NULL,150000,'2017-11-20'),
 (7,'Nina Rossi','Sales',6,90000,'2020-07-01'),
 (8,'Omar Haddad','Sales',6,85000,'2021-02-15'),
 (9,'Yuki Tanaka','Sales',6,85000,'2023-01-09'),
 (10,'Grace Kim','HR',NULL,120000,'2019-05-05'),
 (11,'Henry Wu','HR',10,70000,'2022-08-22');

CREATE TABLE accounts (
  account_id INTEGER PRIMARY KEY, customer_id INTEGER, account_type VARCHAR, opened_on DATE, balance DECIMAL(12,2)
);
INSERT INTO accounts VALUES
 (1001,1,'checking','2022-01-10',5200.50),(1002,1,'savings','2022-01-10',18000.00),
 (1003,2,'checking','2022-03-14',320.75),(1004,3,'savings','2022-05-01',42000.00),
 (1005,4,'checking','2022-06-21',-150.00),(1006,5,'checking','2023-01-02',980.10);

CREATE TABLE transactions (
  txn_id INTEGER PRIMARY KEY, account_id INTEGER, txn_ts TIMESTAMP, amount DECIMAL(12,2), txn_type VARCHAR
);
INSERT INTO transactions VALUES
 (1,1001,'2024-01-02 09:15:00',-45.20,'debit'),(2,1001,'2024-01-03 12:00:00',2500.00,'credit'),
 (3,1001,'2024-01-05 18:30:00',-120.00,'debit'),(4,1002,'2024-01-04 10:00:00',1000.00,'credit'),
 (5,1003,'2024-01-06 08:45:00',-60.00,'debit'),(6,1003,'2024-01-09 14:20:00',400.00,'credit'),
 (7,1004,'2024-01-10 11:11:00',-2000.00,'debit'),(8,1005,'2024-01-11 16:05:00',-150.00,'debit'),
 (9,1001,'2024-01-12 19:40:00',-9800.00,'debit'),(10,1006,'2024-01-13 07:30:00',-35.00,'debit'),
 (11,1001,'2024-01-15 09:00:00',3000.00,'credit'),(12,1002,'2024-01-20 10:00:00',500.00,'credit');

CREATE TABLE web_events (
  event_id INTEGER, user_id INTEGER, event_type VARCHAR, event_ts TIMESTAMP
);
INSERT INTO web_events VALUES
 (1,1,'login','2024-03-01 08:00:00'),(2,1,'view','2024-03-01 08:02:00'),
 (3,1,'add_to_cart','2024-03-01 08:05:00'),(4,1,'purchase','2024-03-01 08:09:00'),
 (5,2,'login','2024-03-01 09:00:00'),(6,2,'view','2024-03-01 09:01:00'),
 (7,2,'view','2024-03-01 09:50:00'),(8,3,'login','2024-03-02 11:00:00'),
 (9,3,'view','2024-03-02 11:03:00'),(10,3,'add_to_cart','2024-03-02 11:04:00'),
 (11,1,'login','2024-03-03 08:00:00'),(12,1,'view','2024-03-03 08:01:00'),
 (13,2,'login','2024-03-03 20:00:00'),(14,4,'login','2024-03-04 07:00:00'),
 (15,4,'view','2024-03-04 07:05:00'),(16,4,'add_to_cart','2024-03-04 07:06:00'),
 (17,4,'purchase','2024-03-04 07:08:00'),(18,2,'login','2024-03-05 10:00:00');

-- Staging with duplicates (for deduplication / incremental exercises)
CREATE TABLE stg_customers (
  customer_id INTEGER, name VARCHAR, email VARCHAR, updated_at TIMESTAMP
);
INSERT INTO stg_customers VALUES
 (1,'Alice Johnson','alice@example.com','2024-01-01 10:00:00'),
 (1,'Alice J. Johnson','alice.j@example.com','2024-02-01 10:00:00'),
 (2,'Bob Smith','bob@example.com','2024-01-05 09:00:00'),
 (3,'Chandra Rao','chandra@example.com','2024-01-06 09:00:00'),
 (3,'Chandra Rao','chandra.rao@example.com','2024-03-01 09:00:00'),
 (3,'Chandra R.','chandra.rao@example.com','2024-03-01 09:00:30'),
 (4,'Diana Lopez','diana@example.com','2024-02-10 12:00:00');

-- Simple star schema + SCD2 dimension
CREATE TABLE dim_customer_scd2 (
  sk INTEGER, customer_id INTEGER, city VARCHAR, valid_from DATE, valid_to DATE, is_current BOOLEAN
);
INSERT INTO dim_customer_scd2 VALUES
 (1,1,'Boston','2022-01-01','2023-06-30',false),
 (2,1,'Seattle','2023-07-01','9999-12-31',true),
 (3,2,'London','2022-01-01','9999-12-31',true),
 (4,3,'Mumbai','2022-01-01','2023-12-31',false),
 (5,3,'Pune','2024-01-01','9999-12-31',true);

CREATE TABLE fact_sales (
  sale_id INTEGER, sale_date DATE, customer_id INTEGER, product_id INTEGER, amount DECIMAL(10,2)
);
INSERT INTO fact_sales VALUES
 (1,'2022-09-10',1,1,1200),(2,'2023-02-11',1,2,25),(3,'2023-09-12',1,3,95),
 (4,'2023-03-03',3,4,450),(5,'2024-02-20',3,5,320),(6,'2024-03-02',2,6,12.5);

CREATE TABLE monthly_sales (
  month DATE, region VARCHAR, revenue DECIMAL(12,2)
);
INSERT INTO monthly_sales VALUES
 ('2024-01-01','EMEA',10000),('2024-02-01','EMEA',12000),('2024-03-01','EMEA',9000),
 ('2024-04-01','EMEA',15000),('2024-01-01','APAC',7000),('2024-02-01','APAC',7500),
 ('2024-03-01','APAC',9500),('2024-04-01','APAC',9000);
