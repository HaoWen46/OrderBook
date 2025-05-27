# FHE Risk Assessment Service

A privacy-preserving financial risk assessment service using Fully Homomorphic Encryption (FHE). This service allows clients to compute risk scores on encrypted financial data without revealing sensitive information to the server.

## Features

- **Privacy-Preserving**: All computations are performed on encrypted data using TenSEAL
- **Risk Assessment**: Evaluates financial risk based on 6 key factors
- **Dual Endpoints**: Supports both simplified demo and full FHE workflows
- **RESTful API**: Easy-to-use FastAPI backend with CORS support

## Prerequisites

### Python Version
- **Python 3.10** is required (TenSEAL has specific version requirements)

### System Dependencies

#### macOS
```bash
# Install Homebrew if not already installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install required system libraries
brew install cmake
```

#### Ubuntu/Debian
```bash
sudo apt update
sudo apt install -y build-essential cmake python3.10-dev
```

#### Windows
- Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- Install [CMake](https://cmake.org/download/)

## Installation

1. **Navigate to the service directory:**
   ```bash
   cd fhe_service/
   ```

2. **Create a virtual environment (recommended):**
   ```bash
   python3.10 -m venv venv
   
   # Activate the virtual environment
   # On macOS/Linux:
   source venv/bin/activate
   
   # On Windows:
   venv\Scripts\activate
   ```

3. **Install Python dependencies:**
   ```bash
   pip install --upgrade pip
   pip install fastapi uvicorn tenseal pydantic
   ```

   > **Note**: TenSEAL installation may take several minutes as it compiles from source.

## Running the Service

### Standard Command
```bash
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Alternative Commands
```bash
# Run with automatic reload (for development)
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Run directly with Python
python main.py
```

The service will be available at:
- **Local access**: http://localhost:8000
- **Network access**: http://YOUR_IP:8000

## API Endpoints

### 1. Health Check
```
GET /
```
Returns service information and available endpoints.

### 2. Test TenSEAL Installation
```
GET /test
```
Verifies that TenSEAL is working correctly with homomorphic operations.

### 3. Risk Assessment (Demo)
```
POST /assessment
```
Accepts plain features and performs FHE computation server-side.

**Request Body:**
```json
{
  "features": [
    10,    // Years of Experience (0-40)
    75,    // Annual Income in thousands (0-500)
    7,     // Risk Appetite (1-10 scale)
    6,     // Investment Knowledge (1-10 scale)
    4,     // Liquidity Needs (1-10 scale)
    15     // Investment Horizon in years (1-50)
  ]
}
```

**Response:**
```json
{
  "risk_score": 0.6234,
  "raw_score": 0.1456,
  "components": {
    "experience_contribution": -0.0625,
    "income_contribution": -0.0225,
    "risk_appetite_contribution": 0.2100,
    "knowledge_contribution": -0.1000,
    "liquidity_contribution": 0.0450,
    "time_horizon_contribution": -0.0844
  }
}
```

### 4. Risk Assessment (Full FHE)
```
POST /assessment-encrypted
```
Accepts pre-encrypted data from client for true end-to-end encryption.

**Request Body:**
```json
{
  "cipher": "base64_encoded_encrypted_features",
  "public_key": "base64_encoded_public_key",
  "relin_keys": "base64_encoded_relinearization_keys",
  "galois_keys": "base64_encoded_galois_keys"
}
```

## Risk Assessment Model

The service evaluates financial risk based on six factors:

| Factor | Weight | Impact | Range |
|--------|--------|--------|-------|
| Years of Experience | -0.25 | More experience = Lower risk | 0-40 years |
| Annual Income | -0.15 | Higher income = Lower risk | 0-500k |
| Risk Appetite | +0.30 | Higher appetite = Higher risk | 1-10 scale |
| Investment Knowledge | -0.20 | More knowledge = Lower risk | 1-10 scale |
| Liquidity Needs | +0.15 | Higher needs = Higher risk | 1-10 scale |
| Investment Horizon | -0.15 | Longer horizon = Lower risk | 1-50 years |

**Risk Score Interpretation:**
- 0.0 - 0.3: Low Risk
- 0.3 - 0.7: Moderate Risk  
- 0.7 - 1.0: High Risk

## Configuration

The FHE parameters can be modified in `main.py`:

```python
POLY_MOD_DEGREE = 8192        # Polynomial modulus degree
COEFF_MOD_BITS = [60, 40, 40, 60]  # Coefficient modulus bit sizes
GLOBAL_SCALE = 2 ** 40        # Global scale for CKKS scheme
```

## Troubleshooting

### Common Issues

1. **TenSEAL installation fails:**
   ```bash
   # Try installing with verbose output
   pip install tenseal --verbose
   
   # On macOS with Apple Silicon:
   pip install tenseal --no-cache-dir
   ```

2. **Permission errors on Linux:**
   ```bash
   # Make sure you have the required permissions
   sudo chown -R $USER:$USER ~/.cache/pip
   ```

3. **CMake not found:**
   - Ensure CMake is installed and in your PATH
   - On Windows, restart terminal after CMake installation

4. **Python version issues:**
   ```bash
   # Check your Python version
   python --version
   
   # Use specific Python 3.10 if multiple versions installed
   python3.10 -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

### Testing the Installation

1. **Start the service:**
   ```bash
   python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

2. **Test the health endpoint:**
   ```bash
   curl http://localhost:8000/
   ```

3. **Test TenSEAL functionality:**
   ```bash
   curl http://localhost:8000/test
   ```

4. **Test risk assessment:**
   ```bash
   curl -X POST http://localhost:8000/assessment \
     -H "Content-Type: application/json" \
     -d '{"features": [10, 75, 7, 6, 4, 15]}'
   ```

## Development

### Project Structure
```
fhe_service/
├── main.py           # Main FastAPI application
├── README.md         # This file
└── requirements.txt  # Python dependencies (optional)
```

### Adding Dependencies
Create a `requirements.txt` file:
```txt
fastapi==0.104.1
uvicorn[standard]==0.24.0
tenseal==0.3.14
pydantic==2.5.0
```

Install with: `pip install -r requirements.txt`

## Security Considerations

- This is a demonstration service and should not be used in production without additional security measures
- In production, implement proper authentication, rate limiting, and input validation
- Consider using HTTPS in production environments
- The demo endpoint decrypts data server-side for simplicity - use the encrypted endpoint for true privacy

## License

This project is for educational and demonstration purposes.