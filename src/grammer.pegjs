Start
  = _ defs:StructDefList _ { return defs; }

StructDefList
  = s:StructDef* { return s; }

StructDef
  = _ "struct" __ name:Identifier _ "{" _ fields:FieldList _ "}" { 
      return { name, fields }; 
    }

FieldList
  = f:Field* { return f; }

Field
  = _ name:Identifier _ ":" _ type:Identifier _ ","? _ { 
      return [name, type]; 
    }

Identifier
  = [a-zA-Z_][a-zA-Z0-9_]* { return text(); }

_  = [ \t\n\r]*      // optional whitespace
__ = [ \t\n\r]+      // required whitespace