import assert from 'node:assert/strict';
import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

export async function responseValidator(spec) {
  const contract = await SwaggerParser.validate(structuredClone(spec), { resolve: { external: false } });
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validators = new Map();
  return (path, status, body) => {
    const key = `${path} ${status}`;
    let validate = validators.get(key);
    if (!validate) {
      const schema = contract.paths[path]?.get?.responses[status]?.content['application/json']?.schema;
      assert.ok(schema, `Undocumented response: ${key}`);
      validate = ajv.compile(schema);
      validators.set(key, validate);
    }
    assert.ok(validate(body), `${key}: ${ajv.errorsText(validate.errors, { separator: '\n' })}`);
  };
}
