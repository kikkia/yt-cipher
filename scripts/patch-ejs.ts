import { walk } from "https://deno.land/std@0.224.0/fs/walk.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";

const EJS_SRC_DIR = join(Deno.cwd(), "ejs/src");

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

console.log(`Starting to patch files in ${EJS_SRC_DIR}...`);

for await (const entry of walk(EJS_SRC_DIR, { exts: [".ts"] })) {
    if (entry.isFile) {
        await patchFile(entry.path);
    }
}

console.log("Patching complete.");