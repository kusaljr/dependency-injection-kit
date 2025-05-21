import { describe } from "@jest/globals";
import { Injectable } from "../decorators/injectable";
import { Container } from "./container";

describe("Container", () => {
  let container: Container;

  beforeEach(() => {
    container = Container.getInstance();
  });

  it("should be a singleton", () => {
    const anotherContainer = Container.getInstance();
    expect(container).toBe(anotherContainer);
  });

  it("should register and resolve a class", () => {
    class TestClass {}

    container.register(TestClass);
    const instance = container.resolve(TestClass);
    expect(instance).toBeInstanceOf(TestClass);
  });

  it("should throw an error when trying to register the same class twice", () => {
    class TestClass {}

    container.register(TestClass);
    expect(() => container.register(TestClass)).toThrow(
      "Token already registered."
    );
  });

  it("should resolve a class with dependencies", () => {
    @Injectable()
    class Dependency {}

    @Injectable()
    class TestClass {
      constructor(public dependency: Dependency) {}
    }

    container.register(Dependency);
    container.register(TestClass);

    const instance = container.resolve(TestClass);
    expect(instance).toBeInstanceOf(TestClass);
    expect(instance.dependency).toBeInstanceOf(Dependency);
  });

  it("should throw an error when trying to resolve a class without registration", () => {
    class TestClass {}

    expect(() => container.resolve(TestClass)).toThrow(
      "No registration for token: TestClass"
    );
  });

  it("should throw error if it tries to resolve a class with unregistered dependencies", () => {
    @Injectable()
    class UnregisteredDependency {}

    @Injectable()
    class TestClass {
      constructor(public dependency: UnregisteredDependency) {}
    }

    container.register(TestClass);

    expect(() => container.resolve(TestClass)).toThrow(
      "No registration for token: UnregisteredDependency"
    );
  });
});
