import * as fs from "fs";
import jsYaml from "js-yaml";
import { fromMarkdown } from "mdast-util-from-markdown";
import { frontmatterFromMarkdown } from "mdast-util-frontmatter";
import { frontmatter } from "micromark-extension-frontmatter";
import ts from "typescript";
import type * as unist from "unist";

// commandLineParser.ts maps option names -> current (old) diagnostic
// names. Lookup new descriptions in website Markdown and rewrite
// diagnostic names accordingly.
const commandLineParserFileName =
  "TypeScript/src/compiler/commandLineParser.ts";
const commandLineParserText = String(
  fs.readFileSync(commandLineParserFileName)
);
const sourceFile = ts.createSourceFile(
  commandLineParserFileName,
  commandLineParserText,
  0
);
const newMessages: { [oldName: string]: string } = {};
ts.forEachChild(sourceFile, visit);
fs.writeFileSync(
  commandLineParserFileName,
  commandLineParserText.replace(
    new RegExp(String.raw`\b(?:${Object.keys(newMessages).join("|")})\b`, "g"),
    (oldName) => convertPropertyName(newMessages[oldName])
  )
);

// Replace old messages with new
Object.assign(
  newMessages,
  Object.fromEntries(
    Object.values(newMessages).map((newMessage) => [
      convertPropertyName(newMessage),
      newMessage,
    ])
  )
);
const diagnosticMessagesFileName =
  "TypeScript/src/compiler/diagnosticMessages.json";
const diagnosticMessagesText = String(
  fs.readFileSync(diagnosticMessagesFileName)
);
const diagnosticMessages = JSON.parse(diagnosticMessagesText);
const oldNames = new Set(
  Object.keys(diagnosticMessages).map((oldMessage) =>
    convertPropertyName(oldMessage)
  )
);
fs.writeFileSync(
  diagnosticMessagesFileName,
  (
    JSON.stringify(
      Object.fromEntries(
        Object.entries(diagnosticMessages)
          .map(([oldMessage, data]) => {
            const oldName = convertPropertyName(oldMessage);
            const newMessage = newMessages[oldName];
            const newName = newMessage && convertPropertyName(newMessage);
            // Careful not to insert duplicates
            return (
              (newName === oldName || !oldNames.has(newName)) && [
                newMessage || oldMessage,
                data,
              ]
            );
          })
          .filter(
            (entry): entry is Exclude<typeof entry, false> => entry as never
          )
      ),
      undefined,
      4
    ) + "\n"
  ).replace(/\n/g, "\r\n") //.replaceAll("\n", "\r\n")
);

// Visit nodes like the following:
// {
//   name: "optionName",
//   description: Diagnostics.Voila_la_description
// }
function visit(node: ts.Node) {
  if (!ts.isObjectLiteralExpression(node)) {
    ts.forEachChild(node, visit);
    return;
  }
  const name = getPropertyAssignment(node, "name");
  if (!name || !ts.isStringLiteral(name.initializer)) return;
  const description = getPropertyAssignment(node, "description");
  if (
    !description ||
    !ts.isPropertyAccessExpression(description.initializer) ||
    !ts.isIdentifier(description.initializer.expression) ||
    description.initializer.expression.text !== "Diagnostics"
  )
    return;
  const optionName = name.initializer.text;
  const oldName = description.initializer.name.text;
  const newMessage = getDescription(optionName);
  if (!newMessage) return;
  newMessages[oldName] = newMessage;
}

function getPropertyAssignment(obj: ts.ObjectLiteralExpression, name: string) {
  return obj.properties.find(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) &&
      ts.isIdentifier(property.name) &&
      property.name.text === name
  );
}

// Get new description from website Markdown
function getDescription(optionName: string) {
  const fileName = new URL(
    `../copy/en/options/${optionName}.md`,
    import.meta.url
  );
  if (!fs.existsSync(fileName)) return;
  const doc = fs.readFileSync(fileName);
  const optionTree = fromMarkdown(doc, {
    extensions: [frontmatter()],
    mdastExtensions: [frontmatterFromMarkdown()],
  });
  // Get frontmatter
  const yaml = optionTree.children.find(
    (yaml): yaml is typeof yaml & { type: "yaml" } => yaml.type === "yaml"
  );
  if (!yaml) return;
  const data = jsYaml.load(yaml.value) as { oneline: string };
  // Strip Markdown
  const descriptionTree = fromMarkdown(data.oneline);
  return toString(descriptionTree);
}

function toString(node: Partial<unist.Parent>): string {
  return node.type === "inlineCode"
    ? `'${node.value}'`
    : (node.value as string) ||
        node.children?.map((child) => toString(child)).join("") ||
        "";
}

// https://github.com/microsoft/TypeScript/blob/e00b5ecd406b3d299ca69ef6780cc22ef0ecef4a/scripts/processDiagnosticMessages.ts#L106-L124
function convertPropertyName(origName: string): string {
  let result = origName
    .split("")
    .map((char) => {
      if (char === "*") return "_Asterisk";
      if (char === "/") return "_Slash";
      if (char === ":") return "_Colon";
      return /\w/.test(char) ? char : "_";
    })
    .join("");

  // get rid of all multi-underscores
  result = result.replace(/_+/g, "_");

  // remove any leading underscore, unless it is followed by a number.
  result = result.replace(/^_([^\d])/, "$1");

  // get rid of all trailing underscores.
  result = result.replace(/_$/, "");

  return result;
}
