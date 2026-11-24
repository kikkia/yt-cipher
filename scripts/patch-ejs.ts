import { walk } from "https://deno.land/std@0.224.0/fs/walk.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";

const EJS_SRC_DIR = join(Deno.cwd(), "ejs/src");
const SOLVERS_PATH = join(EJS_SRC_DIR, "yt/solver/solvers.ts");

async function patchFile(path: string) {
    let content = await Deno.readTextFile(path);
    let changed = false;

    const replacements = [
        { from: /from ["']meriyah["']/g, to: 'from "npm:meriyah"' },
        { from: /from ["']astring["']/g, to: 'from "npm:astring"' }
    ];

    for (const replacement of replacements) {
        if (replacement.from.test(content)) {
            content = content.replace(replacement.from, replacement.to);
            changed = true;
        }
    }

    if (changed) {
        await Deno.writeTextFile(path, content);
        console.log(`Patched ${path}`);
    }
}

// Keep top-level Closure prototype/inheritance helper calls (e.g. `g.z(Sub, Base)`)
// when preprocessing players so kept top-level `new Sub` statements do not throw
// `TypeError: a.addOnDisposeCallback is not a function` (see yt-dlp/ejs#79, #81).
async function patchSolversPrototypeHelpers(path: string) {
    let content = await Deno.readTextFile(path);

    if (content.includes("findPrototypeHelpers")) {
        console.log(`Prototype helper patch already applied to ${path}`);
        return;
    }

    const importTarget = 'import { generateArrowFunction } from "../../utils.ts";';
    const importReplacement = [
        'import type { DeepPartial } from "../../types.ts";',
        'import { generateArrowFunction, matchesStructure } from "../../utils.ts";',
    ].join("\n");

    if (!content.includes(importTarget)) {
        throw new Error(`Could not find expected utils import in ${path}`);
    }
    content = content.replace(importTarget, importReplacement);

    const filterTarget = `  block.body = block.body.filter((node: ESTree.Statement) => {
    if (node.type === "ExpressionStatement") {
      if (node.expression.type === "AssignmentExpression") {
        return true;
      }
      return node.expression.type === "Literal";
    }
    return true;
  });

  return block.body;
}`;

    const filterReplacement = `  const prototypeHelpers = findPrototypeHelpers(block.body);
  block.body = block.body.filter((node: ESTree.Statement) => {
    if (node.type === "ExpressionStatement") {
      if (node.expression.type === "CallExpression") {
        const call = node.expression;
        return prototypeHelpers.some((identifier) =>
          matchesStructure(call.callee, identifier),
        );
      }
      return (
        node.expression.type === "AssignmentExpression" ||
        node.expression.type === "Literal"
      );
    }
    return true;
  });

  return block.body;
}

function findPrototypeHelpers(
  body: ESTree.Statement[],
): DeepPartial<ESTree.Expression>[] {
  const result: DeepPartial<ESTree.Expression>[] = [];
  for (const node of body) {
    let target: ESTree.Expression | ESTree.Pattern | null = null;
    let funcBody: ESTree.Statement[] | null = null;

    if (
      node.type === "ExpressionStatement" &&
      node.expression.type === "AssignmentExpression" &&
      node.expression.operator === "=" &&
      node.expression.right.type === "FunctionExpression"
    ) {
      target = node.expression.left;
      funcBody = node.expression.right.body?.body ?? null;
    } else if (node.type === "FunctionDeclaration" && node.id) {
      target = node.id;
      funcBody = node.body?.body ?? null;
    } else if (node.type === "VariableDeclaration") {
      for (const decl of node.declarations) {
        if (
          decl.id.type === "Identifier" &&
          decl.init?.type === "FunctionExpression" &&
          assignsPrototype(decl.init.body?.body ?? [])
        ) {
          result.push({ type: "Identifier", name: decl.id.name });
        }
      }
      continue;
    }

    if (target && funcBody && assignsPrototype(funcBody)) {
      const identifier = makePrototypeHelperIdentifier(target);
      if (identifier !== null) {
        result.push(identifier);
      }
    }
  }
  return result;
}

function assignsPrototype(statements: ESTree.Statement[]): boolean {
  return statements.some(
    (line) =>
      line.type === "ExpressionStatement" &&
      line.expression.type === "AssignmentExpression" &&
      line.expression.operator === "=" &&
      line.expression.left.type === "MemberExpression" &&
      !line.expression.left.computed &&
      line.expression.left.property.type === "Identifier" &&
      line.expression.left.property.name === "prototype",
  );
}

function makePrototypeHelperIdentifier(
  node: ESTree.Expression | ESTree.Pattern | ESTree.PrivateIdentifier,
): DeepPartial<ESTree.Expression> | null {
  if (node.type === "MemberExpression" && !node.computed) {
    const object = makePrototypeHelperIdentifier(node.object);
    const property = makePrototypeHelperIdentifier(node.property);
    if (!object || !property) {
      return null;
    }
    return {
      type: "MemberExpression",
      computed: false,
      object,
      property,
    };
  }
  if (node.type === "Identifier") {
    return {
      type: "Identifier",
      name: node.name,
    };
  }
  return null;
}`;

    if (!content.includes(filterTarget)) {
        throw new Error(`Could not find expected modifyPlayer filter block in ${path}`);
    }
    content = content.replace(filterTarget, filterReplacement);

    await Deno.writeTextFile(path, content);
    console.log(`Patched prototype helpers in ${path}`);
}

console.log(`Starting to patch files in ${EJS_SRC_DIR}...`);

for await (const entry of walk(EJS_SRC_DIR, { exts: [".ts"] })) {
    if (entry.isFile) {
        await patchFile(entry.path);
    }
}

await patchSolversPrototypeHelpers(SOLVERS_PATH);

console.log("Patching complete.");