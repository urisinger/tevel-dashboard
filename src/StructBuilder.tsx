import React, { useState, useEffect } from "react";
import { Expr, Value, FieldType, Struct } from "./expr";

interface ValueFormProps {
  structName: string;
  expr: Expr;
  isSocketReady: boolean;
  onSubmit: (value: Value) => void;
}

interface FieldProps {
  name: string;
  type: FieldType;
  expr: Expr;
  onChange: (value: Value) => void;
}

const Field: React.FC<FieldProps> = ({ name, type, expr, onChange }) => {
  // Set default values when component mounts
  React.useEffect(() => {
    // Provide default values immediately
    provideDefaultValue(type);
  }, []);

  const provideDefaultValue = (fieldType: FieldType) => {
    switch (fieldType.kind) {
      case "I8":
        onChange({ kind: "I8", value: 0 });
        break;
      case "I16":
        onChange({ kind: "I16", value: 0 });
        break;
      case "I32":
        onChange({ kind: "I32", value: 0 });
        break;
      case "I64":
        onChange({ kind: "I64", value: BigInt(0) });
        break;
      case "F32":
        onChange({ kind: "F32", value: 0.0 });
        break;
      case "F64":
        onChange({ kind: "F64", value: 0.0 });
        break;
      case "Struct":
        // For structs, the nested StructField component will handle defaults
        break;
    }
  };

  const handlePrimitiveChange = (
    event: React.ChangeEvent<HTMLInputElement>,
    kind: string
  ) => {
    const value = event.target.value;
    
    switch (kind) {
      case "I8":
        onChange({ kind: "I8", value: parseInt(value) || 0 });
        break;
      case "I16":
        onChange({ kind: "I16", value: parseInt(value) || 0 });
        break;
      case "I32":
        onChange({ kind: "I32", value: parseInt(value) || 0 });
        break;
      case "I64":
        // Convert to BigInt
        try {
          onChange({ kind: "I64", value: BigInt(value || 0) });
        } catch (e) {
          onChange({ kind: "I64", value: BigInt(0) });
        }
        break;
      case "F32":
        onChange({ kind: "F32", value: parseFloat(value) || 0 });
        break;
      case "F64":
        onChange({ kind: "F64", value: parseFloat(value) || 0 });
        break;
    }
  };

  const getInputStep = (kind: string) => {
    switch (kind) {
      case "F32":
      case "F64":
        return "any";
      default:
        return "1";
    }
  };

  const getInputMin = (kind: string) => {
    switch (kind) {
      case "I8":
        return -128;
      case "I16":
        return -32768;
      default:
        return undefined;
    }
  };

  const getInputMax = (kind: string) => {
    switch (kind) {
      case "I8":
        return 127;
      case "I16":
        return 32767;
      default:
        return undefined;
    }
  };

  if (type.kind === "Struct") {
    return (
      <StructField
        name={name}
        structName={type.name}
        expr={expr}
        onChange={onChange}
      />
    );
  }

  // Get default value based on type
  const getDefaultValue = (fieldType: FieldType["kind"]) => {
    switch (fieldType) {
      case "I8":
      case "I16":
      case "I32":
        return 0;
      case "I64":
        return "0";
      case "F32":
      case "F64":
        return 0.0;
      default:
        return "";
    }
  };

  return (
    <div className="field-container">
      <label className="field-label">
        {name}: <span className="field-type">{type.kind}</span>
      </label>
      <input
        type="number"
        step={getInputStep(type.kind)}
        min={getInputMin(type.kind)}
        max={getInputMax(type.kind)}
        onChange={(e) => handlePrimitiveChange(e, type.kind)}
        defaultValue={getDefaultValue(type.kind)}
        className="field-input"
      />
    </div>
  );
};

interface StructFieldProps {
  name: string;
  structName: string;
  expr: Expr;
  onChange: (value: Value) => void;
}

const StructField: React.FC<StructFieldProps> = ({
  name,
  structName,
  expr,
  onChange,
}) => {
  const [fieldsValues, setFieldsValues] = useState<[string, Value][]>([]);
  const struct = expr.get(structName);
  const initialized = React.useRef(false);

  if (!struct) {
    return <div className="error-message">Struct '{structName}' not found</div>;
  }

  // Initialize with default values for all fields on first render
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      
      // Start with an empty struct that will be filled with defaults
      const initialFields: [string, Value][] = [];
      onChange({ kind: "Struct", fields: initialFields });
      setFieldsValues(initialFields);
    }
  }, []);

  const handleFieldChange = (fieldName: string, value: Value) => {
    const newFieldsValues = [...fieldsValues];
    const existingIndex = newFieldsValues.findIndex(
      ([name]) => name === fieldName
    );

    if (existingIndex >= 0) {
      newFieldsValues[existingIndex] = [fieldName, value];
    } else {
      newFieldsValues.push([fieldName, value]);
    }

    setFieldsValues(newFieldsValues);
    
    // Make sure the onChange is called with a complete struct
    // that includes values for all fields defined in the struct
    const completeFields = newFieldsValues.length === struct.fields.length
      ? newFieldsValues
      : ensureAllFieldsPresent(newFieldsValues, struct);
    
    onChange({ kind: "Struct", fields: completeFields });
  };
  
  // Helper to ensure all fields from the struct definition are included
  const ensureAllFieldsPresent = (
    currentFields: [string, Value][],
    structDef: Struct
  ): [string, Value][] => {
    const result = [...currentFields];
    const fieldMap = new Map(currentFields);
    
    // Add any missing fields with default values
    for (const [fieldName, fieldType] of structDef.fields) {
      if (!fieldMap.has(fieldName)) {
        // Add a default value based on the type
        let defaultValue: Value;
        
        switch (fieldType.kind) {
          case "I8":
            defaultValue = { kind: "I8", value: 0 };
            break;
          case "I16":
            defaultValue = { kind: "I16", value: 0 };
            break;
          case "I32":
            defaultValue = { kind: "I32", value: 0 };
            break;
          case "I64":
            defaultValue = { kind: "I64", value: BigInt(0) };
            break;
          case "F32":
            defaultValue = { kind: "F32", value: 0.0 };
            break;
          case "F64":
            defaultValue = { kind: "F64", value: 0.0 };
            break;
          case "Struct":
            // For nested structs, we need a default with empty fields array
            defaultValue = { kind: "Struct", fields: [] };
            break;
        }
        
        result.push([fieldName, defaultValue]);
      }
    }
    
    return result;
  };

  return (
    <div className="struct-container">
      <div className="struct-header">
        <span className="struct-name">{name}</span>
        <span className="struct-type">{structName}</span>
      </div>
      <div className="struct-fields">
        {struct.fields.map(([fieldName, fieldType]) => (
          <Field
            key={fieldName}
            name={fieldName}
            type={fieldType}
            expr={expr}
            onChange={(value) => handleFieldChange(fieldName, value)}
          />
        ))}
      </div>
    </div>
  );
};

const ValueForm: React.FC<ValueFormProps> = ({
  structName,
  expr,
  isSocketReady,
  onSubmit,
}) => {
  const [value, setValue] = useState<Value | null>(null);
  const struct = expr.get(structName);
  const formReady = React.useRef(false);

  if (!struct) {
    return <div className="error-message">Struct '{structName}' not found</div>;
  }

  // Determine if the form is ready to submit (all required fields have values)
  useEffect(() => {
    if (value && value.kind === "Struct") {
      const allFieldsPresent = struct.fields.every(([fieldName]) => 
        value.fields.some(([name]) => name === fieldName)
      );
      
      formReady.current = allFieldsPresent;
    } else {
      formReady.current = false;
    }
  }, [value, struct]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (value) {
      onSubmit(value);
    }
  };

  const handleChange = (newValue: Value) => {
    setValue(newValue);
  };

  return (
    <div className="form-container">
      <h2 className="form-title">Building: {structName}</h2>
      <div className="struct-size">
        Size: {expr.sizeOf(structName)} bytes
      </div>
      
      <form onSubmit={handleSubmit}>
        <StructField
          name={structName}
          structName={structName}
          expr={expr}
          onChange={handleChange}
        />
        
        <div className="form-actions">
          <button 
            type="submit" 
            disabled={!isSocketReady || !value}
            className={`submit-button ${!isSocketReady ? 'disabled' : ''}`}
          >
            {!isSocketReady 
              ? 'WebSocket Disconnected' 
              : !value 
                ? 'Fill Form to Submit' 
                : 'Send to WebSocket'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ValueForm;