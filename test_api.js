async function testCreateUser() {
    const url = "http://localhost:3000/api/admin/create-auth-user";
    const payload = {
        id: "test9999",
        name: "테스트유저",
        email: "test9999@school.com"
    };

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        console.log("Response Status:", response.status);
        console.log("Response Data:", data);
    } catch (error) {
        console.error("Test failed:", error);
    }
}

testCreateUser();
