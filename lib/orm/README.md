# DIKIT Object Relational Mapping (ORM)

This module provides a simple Object Relational Mapping (ORM) system for managing database interactions in your application. It allows you to define models that map to database tables, perform CRUD operations, and manage relationships between models.

## Schema Definition

Schema definitions are written in a custom format that describes the structure of your models, including fields, types, constraints, and relationships. The schema is used to generate the necessary database tables and perform migrations.

Schema definition files are typically stored in the root directory of your project with a `.dikit` extension.

Example schema definition:
```plaintext
model user {
  id int @primary_key @default(autoincrement())
  username string @unique @required
  email string @unique @required
  password string @required
  is_active boolean @default(true)
  
  created_at datetime @default(now())
  updated_at datetime
}
```

- @primary_key: Marks the field as the primary key of the model.
- @default: Sets a default value for the field.
- @unique: Ensures that the field value is unique across all records.
- @required: Indicates that the field must have a value.


### Database connections
By putting database url in .env file, you can connect to the database. The ORM supports various databases such as PostgreSQL, MySQL, SQLite, etc. The connection string should be in the format:
```plaintext
DATABASE_URL=postgres://user:password@localhost:5432/mydatabase
```

### Data types
- `int`: Integer type.
- `string`: String type.
- `boolean`: Boolean type.
- `datetime`: Date and time type.

For `json` fields, you can define a structure using nested objects and arrays. For example:
```plaintext
metadata json {
  description: string
  non_vegetarian: boolean
  type: {
    nonce: string
    hash: string
  }
  ingredients: string[]
  calories?: number
  code_type?: string
}
```


## Operations
The ORM supports basic CRUD operations (Create, Read, Update, Delete) on the defined models. You can perform these operations using the provided methods.

### Inserting Records
To insert a new record into the database, you can use the `insert` method on the model class. For example:

```javascript
const newUser = await dikitDb.table('user').insert({
  username: 'john_doe'
});
```

### Querying Records
You can query records using the `where` method to filter results. For example:

```javascript
const users = await dikitDb.table('user').where({ "user"."isActive": true }).execute();
``` 

#### Selecting Fields
You can select specific fields from the records using the `select` method:
```javascript
const users = await dikitDb.table('user').select(['username', 'email']).where({ "user"."isActive": true }).execute();
``` 



## Relationships
The ORM supports defining relationships between models, such as one-to-one, one-to-many, and many-to-many relationships. You can define these relationships in the schema and use them to perform related queries.

### One-to-One Relationship
To define a one-to-one relationship, you can use the `@one_to_one` directive in the schema. For example:
```plaintext
model user {
  id int
  name string
  profile profile @one_to_one
}
model profile {
  id int
  bio string
  user_id int
  user user @one_to_one(user_id)
}

```

### One-to-Many Relationship
To define a one-to-many relationship, you can use the `@one_to_many` directive in the schema. For example:
```plaintext
model user {
  id int
  name string
  products product[] @one_to_many
}   
model product {
  id int
  name string
  user_id int
  user user @many_to_one(user_id)
}
``` 

### Many-to-Many Relationship
To define a many-to-many relationship, you can use the `@many_to_many` directive in the schema. For example:
```plaintext
model user {
  id int
  name string
  roles role[] @many_to_many    
}

model role {
  id int
  name string   
  users user[] @many_to_many
}
```

### Querying Related Records
You can query related records using the `innerJoin`, `leftJoin`, or `rightJoin` methods. For example, to get all users with their profiles:

```javascript
const usersWithProfiles = await dikitDb.table('user')
  .innerJoin('profile', 'user.id', 'profile.user_id = profile.user_id')
  .select(['user.id', 'user.name', 'profile.bio'])
  .execute();
```



> Note: The ORM will automatically type the related records based on the schema definition, allowing you to access related records easily.


## Migrations
The ORM supports migrations to manage changes to the database schema over time. You can create migration files that define the changes to be applied to the database, such as adding or removing fields, changing data types, or modifying relationships.   
You can run migrations using the `migrate` command, which will apply the changes to the database schema.

## Transactions
The ORM supports transactions to ensure that a series of database operations are executed atomically. You can use the `transaction` method to group multiple operations into a single transaction. If any operation fails, the entire transaction will be rolled back, ensuring data integrity.
```javascript
await dikitDb.transaction(async (trx) => {
  await trx.table('user').insert({ username: 'john_doe' });
  await trx.table('profile').insert({ user_id: 1, bio: 'Hello World' });
});
```


### Visualizer
A database visualizer tool is included to help visualize the database schema. You can run the visualizer using the following command:
```bash
npm run orm:visualize
```
This will generate a visual representation of the database schema, showing the tables and their relationships.
