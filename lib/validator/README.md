# Express Dependency Injection Kit Validator

This library provides a set of decorators and utilities for validating request parameters, query strings, and body data in your Express applications. It uses `zod` under the hood for validation.

## Features

| Decorator     | Description                                                   |
| ------------- | ------------------------------------------------------------- |
| @IsString()   | Validates that the value is a string.                         |
| @IsNumber()   | Validates that the value is a number.                         |
| @IsEmail()    | Validates that the value is a valid email address.            |
| @IsOptional() | Marks a property as optional.                                 |
| @MinLength()  | Validates that the string has a minimum length.               |
| @MaxLength()  | Validates that the string has a maximum length.               |
| @IsBoolean()  | Validates that the value is a boolean.                        |
| @IsArray()    | Validates that the value is an array.                         |
| @IsObject()   | Validates that the value is an object.                        |
| @IsDate()     | Validates that the value is a date.                           |
| @IsEnum()     | Validates that the value is one of the specified enum values. |
