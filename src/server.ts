import express, { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { log } from "console";

// Create an instance of the Express app
const app = express();
// Create an instance of the Prisma client
const prisma = new PrismaClient();

// Parse incoming request bodies as JSON
app.use(express.json());

app.post("/identify", async (req: Request, res: Response) => {
  const { email, phoneNumber } = req.body;

  // Check if email or phoneNumber is provided
  if (!email && !phoneNumber) {
    return res
      .status(400)
      .json({ error: "Either email or phoneNumber is required" });
  }

  // Find the first existing contact with the provided email or phoneNumber
  const existingContact = await prisma.contact.findFirst({
    where: {
      OR: [{ email }, { phoneNumber }],
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  // If no existing contact is found, create a new one and return it
  if (!existingContact) {
    const newContact = await prisma.contact.create({
      data: {
        email,
        phoneNumber,
        linkPrecedence: "primary",
      },
    });

   
    
    return res.json({
      contact: {
        primaryContactId: newContact.id,
        emails: newContact.email ? [newContact.email] : [],
        phoneNumbers: newContact.phoneNumber ? [newContact.phoneNumber] : [],
        secondaryContactIds: [],
      },
    });
  }

  // Find existing contacts with the provided email or phoneNumber
  const existingemailContact = await prisma.contact.findFirst({
    where: {
      email,
    },
  });

  const existingNumberContact = await prisma.contact.findFirst({
    where: {
      phoneNumber,
    },
  });

  const contacts = await prisma.contact.findMany({
    where: {
      OR: [{ email }, { phoneNumber }, { linkedId: existingContact.id },{id: existingContact.linkedId? existingContact.linkedId : 0}],
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  // Find the primary contact and secondary contacts
  const primaryContact = contacts.find((c) => c.linkPrecedence === "primary");
  const secondaryContacts = contacts.filter((c) => c.id !== primaryContact?.id);

  const newSecondaryContact =
    contacts.length > 0 &&
    ((!existingemailContact && email) || (!existingNumberContact && phoneNumber));

  // If there's a new secondary contact and no existing email/phone contact, create a new secondary contact
  if (newSecondaryContact) {
    console.log(existingContact.email);
    
    const secondaryContact = await prisma.contact.create({
      data: {
        email: email || existingContact.email,
        phoneNumber: phoneNumber || existingContact.phoneNumber,
        linkedId: existingContact.id,
        linkPrecedence: "secondary",
      },
    });
    console.log("made because no existing contact");
    
    secondaryContacts.push(secondaryContact);
  }

  // If there are other contacts with "primary" precedence, update them to "secondary"
  if (
    primaryContact &&
    secondaryContacts.some((c) => c.linkPrecedence === "primary")
  ) {
    const oldPrimaryContact = primaryContact;
    const otherPrimaryContacts = secondaryContacts.filter(
      (c) => c.linkPrecedence === "primary"
    );

    await Promise.all(
      otherPrimaryContacts.map((c) =>
        prisma.contact.update({
          where: { id: c.id },
          data: {
            linkPrecedence: "secondary",
            linkedId: oldPrimaryContact.id,
          },
        })
      )
    );
  }

  // Get the updated list of contacts
  const contacts_updated = await prisma.contact.findMany({
    where: {
      OR: [{ email }, { phoneNumber }, { linkedId: existingContact.id },{ id: existingContact.linkedId ? existingContact.linkedId : 0 }],
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  // Filter out secondary contacts
  const secondaryContacts_updated = contacts_updated.filter(
    (c) => c.linkPrecedence === "secondary"
  );

  // Create a unique set of emails and phone numbers
  const emails = Array.from(
    new Set(contacts_updated.map((c) => c.email).filter(Boolean))
  );
  const phoneNumbers = Array.from(
    new Set(contacts_updated.map((c) => c.phoneNumber).filter(Boolean))
  );
  const secondaryContactIds = Array.from(
    new Set(secondaryContacts_updated.map((c) => c.id))
  );

  // Return the primary contact ID, emails, phone numbers, and secondary contact IDs
  return res.json({
    contact: {
      primaryContactId: primaryContact?.id || -1,
      emails,
      phoneNumbers,
      secondaryContactIds,
    },
  });
});

// Start the server
app.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});