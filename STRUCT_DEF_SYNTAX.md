# Struct Definition File Syntax Documentation

This document describes the syntax for `.def` files used to define binary data structures for parsing and visualization.

## Overview

The struct definition language allows you to define:
- **Structs**: Collections of named fields with specific data types
- **Enums**: Named integer constants with explicit values
- **Arrays**: Fixed-size or dynamic-size collections of elements
- **Match expressions**: Conditional field parsing based on discriminant values

## Basic Syntax

### Comments
```rust
// Single-line comments start with //
field_name: i32,  // Comments can appear at end of lines
```

### Structs

Basic struct definition:
```rust
struct StructName {
    field1: i32,
    field2: u16,
    field3: f32,
}
```

**Rules:**
- Struct names must be valid identifiers (letters, numbers, underscores)
- Fields are separated by commas
- Trailing commas are allowed
- Field names must be unique within a struct

### Enums

Enum definition with explicit values:
```rust
enum StatusCode {
    OK = 0,
    ERROR = 1,
    WARNING = 2,
    CRITICAL = 255,
}
```

**Rules:**
- Each enum entry must have an explicit integer value
- Values can be positive or negative integers
- Enum names and entry names must be valid identifiers

## Data Types

### Integer Types

**Signed integers:**
- `i8` - 8-bit signed integer (-128 to 127)
- `i16` - 16-bit signed integer (-32,768 to 32,767)
- `i32` - 32-bit signed integer (-2,147,483,648 to 2,147,483,647)
- `i64` - 64-bit signed integer

**Unsigned integers:**
- `u8` - 8-bit unsigned integer (0 to 255)
- `u16` - 16-bit unsigned integer (0 to 65,535)
- `u32` - 32-bit unsigned integer (0 to 4,294,967,295)
- `u64` - 64-bit unsigned integer

**Examples:**
```rust
struct IntegerExample {
    battery_voltage: i16,     // Signed 16-bit
    sensor_count: u8,         // Unsigned 8-bit
    timestamp: u32,           // Unsigned 32-bit
    temperature: i32,         // Signed 32-bit
}
```

### Floating Point Types

- `f32` - 32-bit IEEE 754 floating point
- `f64` - 64-bit IEEE 754 floating point

**Examples:**
```rust
struct FloatExample {
    latitude: f64,
    longitude: f64,
    altitude: f32,
}
```

### String Types

- `CString` - Null-terminated C-style string
- `HebrewString` - Fixed-length string (30 bytes) for Hebrew text

**Examples:**
```rust
struct StringExample {
    device_name: CString,
    fallen_name: HebrewString,
}
```

### Array Types

**Fixed-size arrays:**
```rust
struct ArrayExample {
    sensor_readings: [f32; 8],        // Array of 8 floats
    status_flags: [u8; 16],           // Array of 16 bytes
    coordinates: [i32; 3],            // Array of 3 integers
}
```

**Dynamic-size arrays (length determined by another field):**
```rust
struct DynamicArrayExample {
    count: u8,
    values: [i32; count],             // Array size determined by 'count' field
}
```

**Arrays with named constants:**
```rust
struct ConstantArrayExample {
    solar_panels: [i32; ISIS_SOLAR_PANEL_COUNT],  // Size from named constant
    photo_diodes: [u32; 5],                       // Fixed size
}
```

### Custom Struct Types

You can use other defined structs as field types:
```rust
struct Point {
    x: f32,
    y: f32,
}

struct Shape {
    center: Point,        // Using custom struct type
    radius: f32,
}
```

### Enum Types

Use enums as field types with explicit integer backing:
```rust
enum DeviceStatus {
    OFFLINE = 0,
    ONLINE = 1,
    ERROR = 2,
}

struct Device {
    id: u32,
    status: DeviceStatus(u8),     // Enum backed by u8
    name: CString,
}
```

## Advanced Features

### Match Expressions

Match expressions allow conditional field parsing based on a discriminant field:

```rust
enum MessageType {
    TELEMETRY = 1,
    COMMAND = 2,
    STATUS = 3,
}

struct Message {
    msg_type: MessageType(u8),
    length: u16,
    payload: match msg_type {
        TELEMETRY => TelemetryData,
        COMMAND => CommandData,
        STATUS => StatusData,
    },
}
```

**Rules:**
- The discriminant field must be an enum type
- Each case must correspond to an enum entry
- Case values use the enum entry names (not numeric values)

### Default Values

You can specify default values for fields:

```rust
struct ConfigData {
    timeout: u32 = 5000,              // Default timeout of 5 seconds
    max_retries: u8 = 3,              // Default 3 retries
    debug_mode: u8 = 0,               // Default disabled
    device_name: CString = "Unknown", // Default string
}
```

**Supported default types:**
- Integer literals for integer types
- Floating-point literals for float types
- String literals for string types
- Enum entry names for enum types

## Complete Example

```rust
// Enum definitions
enum SensorType {
    TEMPERATURE = 1,
    HUMIDITY = 2,
    PRESSURE = 3,
}

enum SystemStatus {
    BOOT = 0,
    NORMAL = 1,
    WARNING = 2,
    ERROR = 3,
    SHUTDOWN = 4,
}

// Main telemetry structure
struct TelemetryPacket {
    // Header fields
    packet_id: u32,
    timestamp: u32,                           // Unix timestamp
    status: SystemStatus(u8) = NORMAL,        // Default to normal status
    
    // Power system
    battery_voltage: i16,                     // mV
    charging_current: i16,                    // mA
    power_consumption: u16,                   // mW
    
    // Environmental sensors
    sensor_count: u8,
    sensor_data: [f32; sensor_count],         // Dynamic array
    
    // Temperature readings from fixed sensors
    mcu_temperature: i16,
    external_temps: [i16; 4],                 // 4 external sensors
    
    // System info
    uptime: u32,                              // seconds
    free_memory: u32,                         // bytes
    error_count: u16 = 0,                     // Default no errors
    
    // Device identification
    device_name: CString = "Satellite-1",     // Default name
    
    // Conditional payload based on status
    details: match status {
        NORMAL => NormalOperationData,
        WARNING => WarningData,
        ERROR => ErrorData,
        BOOT => BootSequenceData,
        SHUTDOWN => ShutdownData,
    },
}

// Supporting structures for match cases
struct NormalOperationData {
    mission_time: u32,
    last_command: u16,
}

struct WarningData {
    warning_code: u16,
    warning_message: CString,
}

struct ErrorData {
    error_code: u16,
    error_details: CString,
    stack_trace: [u8; 256],
}

struct BootSequenceData {
    boot_stage: u8,
    initialization_flags: u32,
}

struct ShutdownData {
    shutdown_reason: u8,
    final_status: u32,
}
```

## Parsing Rules

1. **Field Order**: Fields are parsed in the order they appear in the struct definition
2. **Byte Alignment**: Data is parsed sequentially without padding (packed structures)
3. **Endianness**: The parser uses the system's native byte order
4. **Array Bounds**: Dynamic arrays must have their length field appear before the array field
5. **Match Resolution**: Match discriminants are evaluated at parse time to determine the correct case

## Error Handling

The parser will report errors for:
- Invalid syntax (missing commas, braces, etc.)
- Undefined type references
- Circular struct dependencies
- Invalid array length references
- Match cases that don't correspond to enum entries
- Invalid default value types

## File Structure

- Files should have a `.def` extension
- Multiple structs and enums can be defined in a single file
- The first struct defined is typically used as the root parsing structure
- All referenced types must be defined in the same file or be built-in types
