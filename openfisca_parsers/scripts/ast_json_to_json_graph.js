#!/usr/bin/env node

import * as process from 'process'

import ArraySchema from 'normalizr/lib/IterableSchema'
import EntitySchema from 'normalizr/lib/EntitySchema'
import UnionSchema from 'normalizr/lib/UnionSchema'
import read from 'read-file-stdin'

import * as schemas from './schemas'

const attributesByEntityType = {
  Parameter: {shape: 'box', style: 'filled'},
  Number: {shape: 'oval'},
  Variable: {shape: 'oval', style: 'filled'}
}

function renderTitle (entity) {
  const titleFunctionByEntityType = {
    ArithmeticOperator: entity => entity.operator,
    Number: entity => entity.value,
    Parameter: entity => entity.path.join('.'),
    PeriodOperator: entity => entity.operator,
    Variable: entity => entity.name
  }
  return titleFunctionByEntityType.hasOwnProperty(entity.type)
      ? titleFunctionByEntityType[entity.type](entity)
      : null
}

function referenceKeys (schema, entity) {
  return Object.keys(schema).filter(key => {
    const value = schema[key]
    return entity.hasOwnProperty(key) && (
      value instanceof ArraySchema ||
      value instanceof EntitySchema ||
      value instanceof UnionSchema
    )
  })
}

function main (fileContent) {
  const data = JSON.parse(fileContent)
  if (!data.result || !data.entities) {
    throw new Error('Provide a normalized AST file (see normalize_ast_json.js script)')
  }
  // Build nodes and edges
  const edgesAttributes = {
    labeldistance: 0
  }
  const nodes = []
  const edges = []
  const {entities} = data
  for (let type in entities) {
    const entityById = entities[type]
    for (let id in entityById) {
      const entity = entityById[id]
      id = entity.id // Overwrite with integer value (keys are strings).
      let label = `${type} ${entity.id}`
      const title = renderTitle(entity)
      if (title !== null) {
        label += '\n' + title
      }
      if (entity._stub) {
        label += '\n(not parsed yet)'
      }
      const attributes = attributesByEntityType[entity.type] || {shape: 'box'}
      nodes.push({id, label, ...attributes})
      const schema = schemas[type]
      for (let referenceKey of referenceKeys(schema, entity)) {
        const referencedSchema = schema[referenceKey]
        if (referencedSchema instanceof EntitySchema) {
          edges.push({
            source: id,
            target: entity[referenceKey],
            directed: true,
            label: referenceKey,
            ...edgesAttributes
          })
        } else if (referencedSchema instanceof ArraySchema) {
          // TODO Handle ArraySchema which elements refer to EntitySchema and not UnionSchema.
          const targets = entity[referenceKey]
          // ArraySchema can be generated by arrayOf or valuesOf.
          if (Array.isArray(targets)) {
            targets.forEach((target, index) => {
              edges.push({
                source: id,
                target: target.id,
                directed: true,
                label: `${referenceKey}[${index}]`,
                ...edgesAttributes
              })
            })
          } else {
            Object.keys(targets).forEach(pyvariableName => {
              const target = targets[pyvariableName]
              const id = `${target.id}.${pyvariableName}`
              nodes.push({
                id,
                label: pyvariableName,
                fontcolor: 'grey',
                color: 'grey',
                shape: 'cds'
              })
              edges.push({
                source: id,
                target: target.id,
                directed: true,
                color: 'grey'
              })
            })
          }
        } else if (referencedSchema instanceof UnionSchema) {
          edges.push({
            source: id,
            target: entity[referenceKey].id,
            directed: true,
            label: referenceKey,
            ...edgesAttributes
          })
        } else {
          throw new Error('Not implemented')
        }
      }
    }
  }
  const result = {
    graph: {
      directed: true,
      nodes,
      edges
    }
  }
  console.log(JSON.stringify(result, null, 2))
}

read(process.argv[2], (err, buffer) => {
  if (err) throw err
  main(buffer)
})