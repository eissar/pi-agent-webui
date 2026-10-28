#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

function sourceFile(name, source) {
  return ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function staticName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return undefined;
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function unique(values) {
  return [...new Set(values)];
}

function visitTree(root, visitor) {
  const visit = (node) => {
    visitor(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
}

function unwrapExpression(expression) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

export function extractInterfaceProperties(name, source, interfaceName) {
  const file = sourceFile(name, source);
  const declaration = file.statements.find(
    (statement) => ts.isInterfaceDeclaration(statement) && statement.name.text === interfaceName,
  );
  if (!declaration || !ts.isInterfaceDeclaration(declaration)) return [];
  return declaration.members.flatMap((member) => {
    if (!member.name) return [];
    const nameValue = staticName(member.name);
    return nameValue === undefined ? [] : [nameValue];
  });
}

export function extractServerHandlers(name, source) {
  const file = sourceFile(name, source);
  const handlers = [];
  visitTree(file, (node) => {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return;
    if (!ts.isIdentifier(node.expression.expression) || node.expression.expression.text !== "server") return;
    if (node.expression.name.text !== "handle") return;
    const object = node.arguments[0] ? unwrapExpression(node.arguments[0]) : undefined;
    if (!object || !ts.isObjectLiteralExpression(object)) return;
    for (const property of object.properties) {
      if (!property.name) continue;
      const nameValue = staticName(property.name);
      if (nameValue !== undefined) handlers.push(nameValue);
    }
  });
  return handlers;
}

function isServerEmitter(expression) {
  if (ts.isIdentifier(expression)) return expression.text === "server";
  return (
    ts.isPropertyAccessExpression(expression) &&
    expression.name.text === "server" &&
    expression.expression.kind === ts.SyntaxKind.ThisKeyword
  );
}

export function extractStreamTopics(sources) {
  const topics = [];
  for (const { name, source } of sources) {
    visitTree(sourceFile(name, source), (node) => {
      if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return;
      if (node.expression.name.text !== "emit" || !isServerEmitter(node.expression.expression)) return;
      const topic = node.arguments[0];
      if (topic && ts.isStringLiteral(topic)) topics.push(topic.text);
    });
  }
  return topics;
}

export function exactCoverageFailures(label, expected, actual, options = {}) {
  const failures = [];
  if (expected.length === 0) failures.push(`Empty extraction for ${label} contract`);
  if (actual.length === 0) failures.push(`Empty extraction for ${label} implementation`);
  const expectedDuplicates = duplicateValues(expected);
  const actualDuplicates = options.allowImplementationDuplicates ? [] : duplicateValues(actual);
  if (expectedDuplicates.length) failures.push(`Duplicate ${label} contract entries: ${expectedDuplicates.join(", ")}`);
  if (actualDuplicates.length)
    failures.push(`Duplicate ${label} implementation entries: ${actualDuplicates.join(", ")}`);
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const missing = unique(expected).filter((value) => !actualSet.has(value));
  const unknown = unique(actual).filter((value) => !expectedSet.has(value));
  if (missing.length) failures.push(`Missing ${label}: ${missing.join(", ")}`);
  if (unknown.length) failures.push(`Unknown ${label}: ${unknown.join(", ")}`);
  return failures;
}

export function analyzeContractCoverage(sources) {
  const apiMethods = extractInterfaceProperties("api.ts", sources.api, "Api");
  const handlers = extractServerHandlers("handlers.ts", sources.handlers);
  const streamContract = extractInterfaceProperties("api.ts", sources.api, "Streams");
  const emittedTopics = extractStreamTopics(sources.streamSources);
  const failures = [
    ...exactCoverageFailures("Api handlers", apiMethods, handlers),
    ...exactCoverageFailures("Streams topics", streamContract, emittedTopics, { allowImplementationDuplicates: true }),
  ];
  return {
    failures,
    counts: { apiMethods: apiMethods.length, streamTopics: streamContract.length },
  };
}

export function assertContractCoverage(sources) {
  const result = analyzeContractCoverage(sources);
  if (result.failures.length) throw new Error(result.failures.join("\n"));
  return result.counts;
}

export function loadContractSources(root) {
  const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
  const streamSources = fs
    .globSync("src/agent-host/**/*.ts", { cwd: root })
    .filter((file) => !file.endsWith(".test.ts"))
    .map((file) => ({ name: file, source: read(file) }));
  return {
    api: read("src/contract/api.ts"),
    handlers: read("src/agent-host/handlers.ts"),
    streamSources,
  };
}

function run() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  try {
    const counts = assertContractCoverage(loadContractSources(root));
    console.log(`Contract coverage OK: ${counts.apiMethods} Api handlers and ${counts.streamTopics} Streams topics`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) run();
