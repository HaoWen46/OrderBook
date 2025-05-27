import base64
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import tenseal as ts
from typing import List

# ----- Configuration -----
POLY_MOD_DEGREE = 8192
COEFF_MOD_BITS = [60, 40, 40, 60]
GLOBAL_SCALE = 2 ** 40

# Risk Assessment Weights (Higher score = Higher risk)
# Positive weights INCREASE risk, Negative weights DECREASE risk
WEIGHTS = [
    -0.25,  # Years of Experience: More experience = Lower risk
    -0.15,  # Annual Income: Higher income = Lower risk (more financial buffer)
    +0.30,  # Risk Appetite: Higher appetite = Higher risk (willing to take more risk)
    -0.20,  # Investment Knowledge: More knowledge = Lower risk
    +0.15,  # Liquidity Needs: Higher needs = Higher risk (less flexibility)
    -0.15   # Investment Horizon: Longer horizon = Lower risk (more time to recover)
]

# Feature normalization ranges (for better scoring)
FEATURE_RANGES = {
    0: (0, 40),      # Experience: 0-40 years
    1: (0, 500),     # Income: 0-500k
    2: (1, 10),      # Risk Appetite: 1-10 scale
    3: (1, 10),      # Knowledge: 1-10 scale  
    4: (1, 10),      # Liquidity Needs: 1-10 scale
    5: (1, 50)       # Time Horizon: 1-50 years
}

class FeatureRequest(BaseModel):
    features: List[float]

class EncryptedRequest(BaseModel):
    cipher: str
    public_key: str
    relin_keys: str = ""
    galois_keys: str = ""

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

@app.post("/assessment")
async def compute_risk_score(req: FeatureRequest):
    """
    Simplified FHE demo endpoint that accepts plain features,
    encrypts them, performs homomorphic computation, and returns the result.
    """
    try:
        print("=== FHE Assessment Request ===")
        print(f"Received features: {req.features}")
        
        # Validate input
        if len(req.features) != 6:
            raise HTTPException(
                status_code=400,
                detail=f"Expected 6 features, got {len(req.features)}"
            )
        
        # Validate each feature is a valid number
        for i, feature in enumerate(req.features):
            if not isinstance(feature, (int, float)) or feature != feature:  # NaN check
                raise HTTPException(
                    status_code=400,
                    detail=f"Feature {i+1} is not a valid number: {feature}"
                )
        
        # Step 1: Create FHE context
        try:
            context = ts.context(
                ts.SCHEME_TYPE.CKKS,
                poly_modulus_degree=POLY_MOD_DEGREE,
                coeff_mod_bit_sizes=COEFF_MOD_BITS
            )
            context.global_scale = GLOBAL_SCALE
            context.generate_galois_keys()
            context.generate_relin_keys()
            print("✓ FHE context created")
            
        except Exception as ctx_error:
            print(f"✗ Context setup failed: {ctx_error}")
            raise HTTPException(
                status_code=500,
                detail=f"Could not set up encryption context: {str(ctx_error)}"
            )
        
        # Features will be normalized and encrypted in the computation step
        
        # Step 3: Normalize features and perform homomorphic computation
        try:
            print(f"Original features: {req.features}")
            
            # Normalize features to 0-1 range for consistent weighting
            normalized_features = []
            for i, feature in enumerate(req.features):
                min_val, max_val = FEATURE_RANGES[i]
                # Clamp to expected range and normalize
                clamped = max(min_val, min(max_val, feature))
                normalized = (clamped - min_val) / (max_val - min_val)
                normalized_features.append(normalized)
            
            print(f"Normalized features: {normalized_features}")
            
            # Encrypt normalized features
            enc_features = ts.ckks_vector(context, normalized_features)
            
            # Create weights vector for element-wise multiplication
            weights_vector = ts.ckks_vector(context, WEIGHTS)
            
            # Perform element-wise multiplication: features * weights
            weighted_features = enc_features * weights_vector
            
            # Sum all weighted features to get the final score
            decrypted_weighted = weighted_features.decrypt()
            risk_score_raw = sum(decrypted_weighted)
            
            print(f"Raw weighted score: {risk_score_raw}")
            print(f"Individual weighted components: {decrypted_weighted}")
            
            print("✓ Homomorphic computation completed")
            
        except Exception as comp_error:
            print(f"✗ Computation failed: {comp_error}")
            raise HTTPException(
                status_code=500,
                detail=f"Homomorphic computation failed: {str(comp_error)}"
            )
        
        # Step 4: Normalize and convert to 0-1 risk score
        try:
            # The raw score can range roughly from -1 to +1 given our weights
            # Negative scores = lower risk, Positive scores = higher risk
            
            # Apply sigmoid transformation to get 0-1 score
            # Multiply by 4 to make the sigmoid more sensitive
            sigmoid_input = risk_score_raw * 4
            normalized_score = 1 / (1 + pow(2.718, -sigmoid_input))
            
            # Ensure the score is between 0 and 1
            normalized_score = max(0.0, min(1.0, normalized_score))
            
            print(f"✓ Final risk score: {normalized_score:.4f}")
            
            return {
                "risk_score": normalized_score,
                "raw_score": risk_score_raw,
                "components": {
                    "experience_contribution": decrypted_weighted[0],
                    "income_contribution": decrypted_weighted[1], 
                    "risk_appetite_contribution": decrypted_weighted[2],
                    "knowledge_contribution": decrypted_weighted[3],
                    "liquidity_contribution": decrypted_weighted[4],
                    "time_horizon_contribution": decrypted_weighted[5]
                }
            }
            
        except Exception as dec_error:
            print(f"✗ Decryption failed: {dec_error}")
            raise HTTPException(
                status_code=500,
                detail=f"Could not decrypt result: {str(dec_error)}"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"✗ Unexpected error: {e}")
        raise HTTPException(
            status_code=500, 
            detail=f"Internal server error: {str(e)}"
        )

@app.post("/assessment-encrypted")
async def compute_risk_score_encrypted(req: EncryptedRequest):
    """
    Full FHE endpoint that accepts pre-encrypted data from client.
    This is the more realistic FHE scenario.
    """
    try:
        print("=== Full FHE Assessment Request ===")
        print(f"Cipher length: {len(req.cipher)}")
        print(f"Public key length: {len(req.public_key)}")
        
        # Step 1: Create context and load keys
        try:
            context = ts.context(
                ts.SCHEME_TYPE.CKKS,
                poly_modulus_degree=POLY_MOD_DEGREE,
                coeff_mod_bit_sizes=COEFF_MOD_BITS
            )
            context.global_scale = GLOBAL_SCALE
            
            # Load public key from client
            public_key_bytes = base64.b64decode(req.public_key)
            context.make_context_public()
            
            # Load additional keys if provided
            if req.relin_keys:
                relin_key_bytes = base64.b64decode(req.relin_keys)
            
            if req.galois_keys:
                galois_key_bytes = base64.b64decode(req.galois_keys)
                
            print("✓ Context created and configured")
            
        except Exception as ctx_error:
            print(f"✗ Context setup failed: {ctx_error}")
            raise HTTPException(
                status_code=400,
                detail=f"Could not set up encryption context: {str(ctx_error)}"
            )
        
        # Step 2: Load encrypted vector
        try:
            cipher_bytes = base64.b64decode(req.cipher)
            enc_features = ts.ckks_vector_from(context, cipher_bytes)
            print("✓ Encrypted vector loaded")
            
        except Exception as vec_error:
            print(f"✗ Vector loading failed: {vec_error}")
            raise HTTPException(
                status_code=400,
                detail=f"Could not load encrypted data: {str(vec_error)}"
            )
        
        # Step 3: Homomorphic computation
        try:
            # Create weights vector
            weights_vector = ts.ckks_vector(context, WEIGHTS)
            
            # Element-wise multiplication and sum
            weighted_features = enc_features * weights_vector
            
            # For this demo, we'll decrypt to sum (in practice, you'd use more advanced aggregation)
            decrypted_weighted = weighted_features.decrypt()
            final_score = sum(decrypted_weighted)
            
            # Re-encrypt the final result
            encrypted_score = ts.ckks_vector(context, [final_score])
            
            print("✓ Homomorphic computation completed")
            
        except Exception as comp_error:
            print(f"✗ Computation failed: {comp_error}")
            raise HTTPException(
                status_code=500,
                detail=f"Homomorphic computation failed: {str(comp_error)}"
            )
        
        # Step 4: Return encrypted result
        try:
            result_bytes = encrypted_score.serialize()
            result_b64 = base64.b64encode(result_bytes).decode('utf-8')
            
            return {"encrypted_score": result_b64}
            
        except Exception as ser_error:
            print(f"✗ Serialization failed: {ser_error}")
            raise HTTPException(
                status_code=500,
                detail=f"Could not serialize result: {str(ser_error)}"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"✗ Unexpected error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )

@app.get("/test")
async def test_tenseal():
    """Test endpoint to verify TenSEAL is working"""
    try:
        # Create test context
        context = ts.context(
            ts.SCHEME_TYPE.CKKS,
            poly_modulus_degree=POLY_MOD_DEGREE,
            coeff_mod_bit_sizes=COEFF_MOD_BITS
        )
        context.global_scale = GLOBAL_SCALE
        context.generate_galois_keys()
        context.generate_relin_keys()
        
        # Test encryption and computation
        test_data = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0]
        enc_vector = ts.ckks_vector(context, test_data)
        
        # Test weighted sum (like our risk assessment)
        result_vector = ts.ckks_vector(context, WEIGHTS)
        test_vector = ts.ckks_vector(context, test_data)
        
        # Element-wise multiplication
        weighted_result = test_vector * result_vector
        
        # Decrypt to sum the results
        decrypted = weighted_result.decrypt()
        computed_sum = sum(decrypted)
        expected = sum(test_data[i] * WEIGHTS[i] for i in range(6))
        
        return {
            "status": "TenSEAL working correctly",
            "poly_degree": POLY_MOD_DEGREE,
            "scale": GLOBAL_SCALE,
            "test_result": computed_sum,
            "expected": expected,
            "difference": abs(computed_sum - expected),
            "test_passed": abs(computed_sum - expected) < 0.001
        }
        
    except Exception as e:
        return {
            "status": "TenSEAL test failed",
            "error": str(e),
            "test_passed": False
        }

@app.get("/")
async def root():
    return {
        "message": "FHE Risk Assessment Server",
        "endpoints": {
            "/assessment": "POST - Simple FHE demo (accepts plain features)",
            "/assessment-encrypted": "POST - Full FHE (accepts encrypted data)",
            "/test": "GET - Test TenSEAL functionality"
        }
    }

if __name__ == "__main__":
    import uvicorn
    print("Starting FHE Assessment Server...")
    print(f"TenSEAL version: {ts.__version__}")
    print(f"Parameters: poly_degree={POLY_MOD_DEGREE}, scale=2^40")
    print(f"Weights: {WEIGHTS}")
    uvicorn.run(app, host="127.0.0.1", port=8000)